from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import List
import httpx

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


# CORS-configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for development; in production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Datavalidation via Pydantic 
# Define structures for incoming chat messages and requests
class ChatMessage(BaseModel):
    role: str     # "user" or "assistant"
    content: str  # The actual text

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# Constant to limit the number of messages sent to Ollama, preventing memory overload on the Raspberry Pi
MAX_HISTORY_MESSAGES = 6
OLLAMA_API_URL = "http://localhost:11434/api/chat"


@app.post("/api/chat")
@limiter.limit("2/30seconds")
async def chat_endpoint(request: Request, chat_data: ChatRequest):
    
    try:
        incoming_history = chat_data.messages
        if len(incoming_history) > MAX_HISTORY_MESSAGES:
            protected_history = incoming_history[-MAX_HISTORY_MESSAGES:]
        else:
            protected_history = incoming_history

        ollama_payload = {
            "model": "llama3.2:1b", 
            "messages": [{"role": msg.role, "content": msg.content} for msg in protected_history],
            "stream": False
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(OLLAMA_API_URL, json=ollama_payload)
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Ollama API error")
            
            ollama_data = response.json()
            
            return {
                "reply": ollama_data["message"]["content"],
                "history_length_sent": len(protected_history) # send history length for debugging
            }

    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Ollama API not reachable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    # Simple health check for monitoring the service
    return {"status": "healthy", "hardware": "Raspberry Pi 4GB"}