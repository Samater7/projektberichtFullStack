from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Databse created in the root directory of the project
SQLALCHEMY_DATABASE_URL = "sqlite:///./chat_history.db"

# engine is the starting point for any SQLAlchemy application. It manages connections to the database and provides a source of database connectivity and behavior.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# SessionLocal is a factory for creating new Session objects. Each Session object represents a "workspace" for interacting with the database, allowing you to query and manipulate data.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is a base class for the ORM models.
Base = declarative_base()

# Dependency function to get a database session. 
#This function is used in FastAPI endpoints to provide a database session for each request. 
#It ensures that the session is properly closed after the request is completed, preventing resource leaks.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()