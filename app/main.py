from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import httpx

app = FastAPI(
    title="Raspberry Pi LLM API",
    description="Asynchronous FastAPI backend for handling chat requests to Ollama on a Raspberry Pi with 4GB RAM.",
)

# 1. CORS-configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for development; in production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Datavalidation via Pydantic 
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
async def chat_endpoint(request: ChatRequest):
    """
    Takes the chat history, truncates it to the RAM limit of the Pi,
    and forwards the request asynchronously to Ollama.
    """
    try:
        # 3. Sliding Window protection for chat history
        # If the history is longer than the limit, the oldest message gets truncated.
        # We keep the newest X messages.
        incoming_history = request.messages
        if len(incoming_history) > MAX_HISTORY_MESSAGES:
            protected_history = incoming_history[-MAX_HISTORY_MESSAGES:]
        else:
            protected_history = incoming_history

        # 4. Prepare the payload for Ollama API
        # Mapping the Pydantic model to a standard Python dictionary for the API
        ollama_payload = {
            "model": "llama3.2:1b", # Recommended, extremely lightweight model for 4GB RAM
            "messages": [{"role": msg.role, "content": msg.content} for msg in protected_history],
            "stream": False # Waiting for the full response before returning to the client, at least for now
        }

        # 5. Asynchronous call to Ollama API using httpx
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(OLLAMA_API_URL, json=ollama_payload)
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Ollama hat einen Fehler gemeldet.")
            
            ollama_data = response.json()
            
            # Extracting the model's response and return it structured
            return {
                "reply": ollama_data["message"]["content"],
                "history_length_sent": len(protected_history) # Helpful for debugging in the frontend
            }

    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Ollama API nicht erreichbar: {exc}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interner Serverfehler: {str(e)}")

@app.get("/api/health")
async def health_check():
    # Simple health check for monitoring the service
    return {"status": "healthy", "hardware": "Raspberry Pi 4GB"}