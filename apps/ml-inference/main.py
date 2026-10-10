from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import health, prediction, recommendation, rag

import os
os.environ["LOKY_MAX_CPU_COUNT"] = "4" # Suppress joblib/loky CPU core warning

app = FastAPI(title="AgroTrace ML Inference Service", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(prediction.router)
app.include_router(recommendation.router)
app.include_router(rag.router)

@app.get("/")
async def root():
    return {"message": "Welcome to AgroTrace ML Inference Service", "status": "active"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "AgroTrace ML Inference Service"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
