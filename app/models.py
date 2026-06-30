from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from .database import Base

class ChatMessage(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True) # Session identifier to group messages from the same chat session
    role = Column(String) # "user" or "assistant"
    content = Column(Text) # The actual text
    timestamp = Column(DateTime, default=datetime.utcnow)