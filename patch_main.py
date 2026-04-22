import re
import os

with open(r"d:\coding_files\Cephus-new-main\fastapi\main.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add imports at top
imports = """import asyncio
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted"""
if "import google.generativeai" not in content:
    content = content.replace("import traceback\n", "import traceback\n" + imports + "\n")

# 2. Replace get_gemini_key with GeminiRotator
rotator_code = """
class GeminiRotator:
    def __init__(self):
        self.keys = []
        if os.environ.get("GEMINI_API_KEY"):
            self.keys.append(os.environ.get("GEMINI_API_KEY"))
        for i in range(1, 13):
            k = os.environ.get(f"GEMINI_API_KEY_{i}") or os.environ.get(f"GOOGLE_API_KEY_{i}")
            if k and k not in self.keys:
                self.keys.append(k)
        self.idx = 0

    def get_next_key(self):
        if not self.keys: return ""
        k = self.keys[self.idx]
        self.idx = (self.idx + 1) % len(self.keys)
        return k

    async def generate_content(self, prompt: str) -> str:
        if not self.keys:
            raise ValueError("No Gemini keys found in environment.")
        
        max_attempts = len(self.keys) * 2
        attempts = 0
        last_err = None
        
        while attempts < max_attempts:
            key = self.get_next_key()
            genai.configure(api_key=key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            try:
                response = await model.generate_content_async(prompt)
                return response.text
            except Exception as e:
                err_str = str(e).lower()
                if "429" in err_str or "resourceexhausted" in err_str or "quota" in err_str:
                    print(f"[GeminiRotator] 429 hit. Switching key. ({attempts+1}/{max_attempts})")
                    attempts += 1
                    last_err = e
                    await asyncio.sleep(1)
                else:
                    raise e
        
        raise Exception(f"Failed to generate after {max_attempts} attempts due to rate limit. Error: {last_err}")

rotator = GeminiRotator()

def get_gemini_key():
    return rotator.get_next_key()
"""

content = re.sub(
    r"def get_gemini_key\(\):.*?return random\.choice\(keys\) if keys else \"\"",
    rotator_code.strip(),
    content,
    flags=re.DOTALL
)

# 3. Replace call_gemini in auto_prompt
content = re.sub(
    r"from utils import call_gemini\s*script_content = await call_gemini\(auto_prompt, get_gemini_key\(\)\)",
    r"script_content = await rotator.generate_content(auto_prompt)",
    content,
    flags=re.DOTALL
)

# 4. Replace generate_mitigated_code in mitigation
mitigation_code = """                mitigate_prompt = f\"\"\"You are an ML fairness expert. Rewrite this training script to mitigate the detected bias.

ORIGINAL TRAINING SCRIPT:
```python
{script_content}
```

BIAS ANALYSIS RESULTS:
{json.dumps({"fairness_metrics": session["fairness_metrics"], "proxy_features": session["proxies"], "code_analysis": session["code_analysis"]}, indent=2)}

REQUIREMENTS FOR THE MODIFIED SCRIPT:
1. Read the dataset from: "{session['dataset_path']}"
2. Target column: "{session['target_column']}"
3. Sensitive attributes: {session['sensitive_attributes']}
4. Apply these mitigation techniques where appropriate:
   - Sample reweighting using sklearn.utils.class_weight.compute_sample_weight
   - Remove or reduce influence of proxy features correlated with sensitive attributes
   - If possible, use fairlearn.reductions.ExponentiatedGradient with DemographicParity constraint
5. Save the retrained model to: "{output_model_path}" using joblib.dump()
6. Print a JSON line to stdout with format: {{"accuracy": 0.XX, "status": "success"}}
7. The script must be fully self-contained and runnable with `python script.py`
8. Keep the same model type/algorithm as the original when possible
9. Import all necessary packages at the top
10. Handle errors gracefully

Return ONLY the modified Python script, no explanations or markdown fences.\"\"\"

                modified_code = await rotator.generate_content(mitigate_prompt)
                modified_code = modified_code.strip()
                if modified_code.startswith("```"):
                    modified_code = modified_code.split("\\n", 1)[1].rsplit("```", 1)[0].strip()"""

content = re.sub(
    r"modified_code = await generate_mitigated_code\(.*?\n                    api_key=get_gemini_key\(\),\n                \)",
    mitigation_code,
    content,
    flags=re.DOTALL
)

# 5. Replace call_gemini in fix_prompt
content = re.sub(
    r"from utils import call_gemini\s*modified_code = await call_gemini\(fix_prompt, get_gemini_key\(\)\)",
    r"modified_code = await rotator.generate_content(fix_prompt)",
    content,
    flags=re.DOTALL
)

with open(r"d:\coding_files\Cephus-new-main\fastapi\main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("patched")
