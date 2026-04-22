import pandas as pd
import numpy as np
import joblib
import json
import sys
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.utils.class_weight import compute_sample_weight
from fairlearn.reductions import ExponentiatedGradient, DemographicParity

def train_mitigated_model():
    input_path = r"D:\coding_files\Cephus-new-main\fastapi\workspaces\11906c0a\dataset.csv"
    output_path = r"D:\coding_files\Cephus-new-main\fastapi\workspaces\11906c0a\mitigated_model.pkl"
    
    try:
        # Load dataset
        df = pd.read_csv(input_path)

        # Requirement: Separate X and y before defining any column transformers or feature lists
        # We drop rows with missing target values first to ensure alignment
        df = df.dropna(subset=["Survived"])
        y = df["Survived"].reset_index(drop=True)
        X_raw = df.drop(columns=["Survived"]).reset_index(drop=True)

        # Preprocessing on X_raw
        # Handling Missing Values
        X_raw["Age"] = X_raw["Age"].fillna(X_raw["Age"].median())
        X_raw["Fare"] = X_raw["Fare"].fillna(X_raw["Fare"].median())
        X_raw["Embarked"] = X_raw["Embarked"].fillna(X_raw["Embarked"].mode()[0] if not X_raw["Embarked"].mode().empty else "S")

        # Encode categorical features and sensitive attributes
        # We use .str.lower() to ensure mapping consistency
        X_raw['Sex_bin'] = X_raw['Sex'].astype(str).str.lower().map({'female': 0, 'male': 1}).fillna(0).astype(int)
        X_raw['Age_bin'] = (X_raw['Age'] < 18).astype(int)
        
        # Mapping for Embarked
        embarked_map = {val: i for i, val in enumerate(X_raw['Embarked'].unique())}
        X_raw['Embarked_num'] = X_raw['Embarked'].map(embarked_map)

        # Define features (X) - must be numeric for RandomForest
        X_train = X_raw[["Pclass", "Sex_bin", "Age", "SibSp", "Parch", "Fare", "Embarked_num"]].copy()
        X_train.columns = ["Pclass", "Sex", "Age", "SibSp", "Parch", "Fare", "Embarked"]

        # Define sensitive features for Fairlearn (can be multiple)
        sensitive_features = X_raw[['Sex_bin', 'Age_bin']]

        # Mitigation Technique: Sample Reweighting for class imbalance
        sample_weights = compute_sample_weight(class_weight='balanced', y=y)

        # Base Model: RandomForestClassifier
        base_estimator = RandomForestClassifier(
            n_estimators=50, 
            random_state=42, 
            min_samples_leaf=5
        )

        # Mitigation Technique: Fairlearn Exponentiated Gradient
        # Using Demographic Parity to address fairness gaps
        mitigator = ExponentiatedGradient(
            estimator=base_estimator,
            constraints=DemographicParity(),
            eps=0.05
        )

        # Fit model with fairness constraints and sample weights
        # We ensure sample_weights is a numpy array to prevent index mismatch issues
        mitigator.fit(X_train, y, sensitive_features=sensitive_features, sample_weight=np.array(sample_weights))

        # Calculate accuracy on training data
        y_pred = mitigator.predict(X_train)
        acc = accuracy_score(y, y_pred)

        # Save the mitigated model
        joblib.dump(mitigator, output_path)

        # Output result as JSON
        print(json.dumps({"accuracy": round(float(acc), 4), "status": "success"}))

    except Exception as e:
        error_msg = str(e).replace('"', "'")
        print(json.dumps({"accuracy": 0, "status": f"error: {error_msg}"}))
        sys.exit(1)

if __name__ == "__main__":
    train_mitigated_model()