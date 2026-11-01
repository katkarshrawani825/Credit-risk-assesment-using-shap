from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).parent
ml_model = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    ml_model["model"] = joblib.load(BASE_DIR / "credit_risk_model.pkl")
    ml_model["threshold"] = joblib.load(BASE_DIR / "best_threshold.pkl")
    yield
    ml_model.clear()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class LoanApplication(BaseModel):
    person_age: int
    person_income: float
    person_home_ownership: str
    person_emp_length: float
    loan_intent: str
    loan_grade: str
    loan_amnt: float
    loan_int_rate: float
    loan_percent_income: float
    cb_person_default_on_file: str
    cb_person_cred_hist_length: int


@app.get("/")
def home():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(data: LoanApplication):
    input_df = pd.DataFrame([data.model_dump()])
    probability = ml_model["model"].predict_proba(input_df)[:, 1][0]
    prediction = int(probability >= ml_model["threshold"])
    return {
        "default_probability": float(probability),
        "default_prediction": prediction,
        "threshold": float(ml_model["threshold"]),
        "Result": "High Risk" if prediction == 1 else "Low Risk",
    }
