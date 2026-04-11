"""Modal deployment for the CoolBid Geometry Service.

Deploy with: modal deploy modal_app.py
Run locally with: modal serve modal_app.py
"""
import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi>=0.115",
        "uvicorn[standard]>=0.34",
        "python-multipart>=0.0.9",
        "opencv-python-headless>=4.10",
        "numpy>=2.0",
        "pydantic>=2.10",
    )
    .pip_install(
        "torch>=2.7",
    )
    .apt_install("git")
    .run_commands(
        # SAM 3 has undeclared deps (einops, pycocotools, psutil)
        "pip install einops pycocotools psutil",
        # SAM 3 (text-prompted segmentation)
        "pip install git+https://github.com/facebookresearch/sam3.git",
        # Patch SAM 3 bfloat16 → float32 to avoid dtype mismatch, then clear .pyc cache
        "find /usr/local/lib/python3.12/site-packages/sam3 -name '*.py' -exec sed -i 's/torch.bfloat16/torch.float32/g' {} +",
        "find /usr/local/lib/python3.12/site-packages/sam3 -name '*.pyc' -delete",
        "find /usr/local/lib/python3.12/site-packages/sam3 -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null; echo 'Patched and cleared cache'",
    )
    .add_local_dir("app", remote_path="/root/app")
)

app = modal.App("coolbid-geometry", image=image)


@app.function(gpu="A10G", timeout=120, secrets=[modal.Secret.from_name("huggingface")])
@modal.asgi_app()
def fastapi_app():
    from app.main import app
    return app
