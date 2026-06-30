from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
from sqlalchemy.orm import Session
from . import models, database
from .database import engine, get_db
import uuid

models.Base.metadata.create_all(bind=engine)
OLLAMA_MODEL = os.getenv("LLM_MODEL", "llama3.2:1b")

app = FastAPI(
    title="Raspberry Pi LLM API",
    description="Asynchronous FastAPI backend for handling chat requests to Ollama on a Raspberry Pi with 4GB RAM.",
)

# Extract the real client IP address, when behind Cloudflare
def get_real_ip(request: Request):
    
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return get_remote_address(request) # Fallback for local testing

# Initialize the Limiter with the custom key function
limiter = Limiter(key_func=get_real_ip)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [url.strip() for url in frontend_url.split(",")]

# CORS-configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins, # Allow all origins for development; in production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Datavalidation via Pydantic 
class ChatRequest(BaseModel):
    new_message: str
    session_id: Optional[str] = None

# Constant to limit the number of messages sent to Ollama, preventing memory overload on the Raspberry Pi
MAX_HISTORY_MESSAGES = 6
OLLAMA_API_URL = "http://localhost:11434/api/chat"


@app.post("/api/chat")
@limiter.limit("2/30seconds")
async def chat_endpoint(
    request: Request, 
    chat_data: ChatRequest, 
    db: Session = Depends(get_db)
):
    try:
        # Determine the session ID: use the provided one or generate a new one if not provided
        current_session_id = chat_data.session_id
        if not current_session_id:
            current_session_id = str(uuid.uuid4())

        # Save the user's message in the database
        user_msg = models.ChatMessage(
            session_id=current_session_id, 
            role="user", 
            content=chat_data.new_message
        )
        db.add(user_msg)
        db.commit()

        # Retrieve the chat history for the current session, ordered by timestamp
        history = db.query(models.ChatMessage).filter(
            models.ChatMessage.session_id == current_session_id
        ).order_by(models.ChatMessage.timestamp.asc()).all()
        
        # Restrict the number of messages sent to Ollama to avoid memory issues on the Raspberry Pi
        if len(history) > MAX_HISTORY_MESSAGES:
            protected_history = history[-MAX_HISTORY_MESSAGES:]
        else:
            protected_history = history

        # Prepare the payload for Ollama API
        ollama_payload = {
            "model": OLLAMA_MODEL,
            "messages": [{"role": msg.role, "content": msg.content} for msg in protected_history],
            "stream": False
        }

        # Send request to Ollama API asynchronously
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(OLLAMA_API_URL, json=ollama_payload)
            
             if response.status_code != 200:
                error_msg = response.text
                raise HTTPException(status_code=500, detail=f"Ollama API error: {response.status_code} - {error_msg}")
            
            ollama_data = response.json()
            ai_reply_text = ollama_data["message"]["content"]

            # Save the AI's reply in the database
            ai_msg = models.ChatMessage(
                session_id=current_session_id, 
                role="assistant", 
                content=ai_reply_text
            )
            db.add(ai_msg)
            db.commit()
            
            # return the AI's reply, the session ID, and the length of the history sent to Ollama
            return {
                "reply": ai_reply_text,
                "session_id": current_session_id,
                "history_length_sent": len(protected_history)
            }

    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Ollama API not reachable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    # Simple health check for monitoring the service
    return {"status": "healthy", "hardware": "Raspberry Pi 4GB"}