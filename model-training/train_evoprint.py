"""
EvoPrint — Fine-tuning LoRA sur WikiArt
========================================
Coller ce script dans Google Colab (GPU T4 gratuit)
URL: https://colab.research.google.com/

Étapes:
  1. Runtime → Change runtime type → GPU (T4)
  2. Copier ce script dans une cellule
  3. Exécuter cellule par cellule
"""

# ═══════════════════════════════════════════════════════════════
# CELLULE 1 — Installation des dépendances
# ═══════════════════════════════════════════════════════════════
"""
!pip install -q diffusers transformers accelerate datasets peft
!pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu118
!pip install -q huggingface_hub bitsandbytes
"""

# ═══════════════════════════════════════════════════════════════
# CELLULE 2 — Connexion HuggingFace (pour sauvegarder le modèle)
# ═══════════════════════════════════════════════════════════════
"""
from huggingface_hub import login
import os
login(token=os.environ["HF_TOKEN"])
"""

# ═══════════════════════════════════════════════════════════════
# CELLULE 3 — Charger le dataset WikiArt
# ═══════════════════════════════════════════════════════════════
import torch
from datasets import load_dataset
from torch.utils.data import DataLoader
from torchvision import transforms
from PIL import Image

print("📦 Chargement du dataset WikiArt...")

dataset = load_dataset(
    "huggan/wikiart",
    split="train",
    streaming=True       # streaming = pas besoin de tout télécharger
)

# Filtrer uniquement les peintures impressionnistes et expressionnistes
# Styles disponibles: impressionism, expressionism, realism, romanticism, etc.
STYLES_CIBLES = [0, 1, 2]   # impressionism, expressionism, realism

def filter_style(example):
    return example.get("style", -1) in STYLES_CIBLES

dataset_filtre = dataset.filter(filter_style)

# Transformation des images
transform = transforms.Compose([
    transforms.Resize((512, 512)),
    transforms.CenterCrop(512),
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])
])

def prepare_batch(examples):
    images = []
    for img in examples["image"]:
        if img.mode != "RGB":
            img = img.convert("RGB")
        images.append(transform(img))
    examples["pixel_values"] = torch.stack(images)
    return examples

print("✅ Dataset WikiArt prêt")
print(f"   Styles: Impressionnisme, Expressionnisme, Réalisme")

# ═══════════════════════════════════════════════════════════════
# CELLULE 4 — Charger le modèle de base + LoRA
# ═══════════════════════════════════════════════════════════════
from diffusers import StableDiffusionPipeline, DDPMScheduler, UNet2DConditionModel
from transformers import CLIPTextModel, CLIPTokenizer
from peft import LoraConfig, get_peft_model
import torch.nn.functional as F

MODEL_BASE = "runwayml/stable-diffusion-v1-5"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🖥️  Device: {DEVICE}")

print("📥 Chargement du modèle de base Stable Diffusion...")

# Charger uniquement les composants nécessaires
tokenizer = CLIPTokenizer.from_pretrained(MODEL_BASE, subfolder="tokenizer")
text_encoder = CLIPTextModel.from_pretrained(MODEL_BASE, subfolder="text_encoder").to(DEVICE)
unet = UNet2DConditionModel.from_pretrained(MODEL_BASE, subfolder="unet").to(DEVICE)
noise_scheduler = DDPMScheduler.from_pretrained(MODEL_BASE, subfolder="scheduler")

# Configurer LoRA sur le UNet (adaptateur léger)
lora_config = LoraConfig(
    r=16,                              # rang LoRA (16 = bon équilibre)
    lora_alpha=32,
    target_modules=[
        "to_q", "to_v",               # couches d'attention
        "to_k", "to_out.0",
        "proj_in", "proj_out",
        "ff.net.0.proj", "ff.net.2"
    ],
    lora_dropout=0.1,
    bias="none"
)

unet = get_peft_model(unet, lora_config)
unet.print_trainable_parameters()
# → Environ 3-5M paramètres entraînables (au lieu de 860M pour le modèle complet)

print("✅ LoRA configuré")

# ═══════════════════════════════════════════════════════════════
# CELLULE 5 — Boucle d'entraînement
# ═══════════════════════════════════════════════════════════════
from torch.optim import AdamW
from accelerate import Accelerator
import os

# Hyperparamètres
LEARNING_RATE  = 1e-4
NUM_EPOCHS     = 3
BATCH_SIZE     = 1          # T4 Colab = 16GB VRAM
GRADIENT_ACCUM = 4          # équivalent batch_size=4
MAX_STEPS      = 1000       # ~30 min sur T4
SAVE_EVERY     = 200        # sauvegarder checkpoint toutes les 200 steps
OUTPUT_DIR     = "./evoprint-wikiart-lora"

os.makedirs(OUTPUT_DIR, exist_ok=True)

optimizer = AdamW(unet.parameters(), lr=LEARNING_RATE, weight_decay=1e-2)
accelerator = Accelerator(gradient_accumulation_steps=GRADIENT_ACCUM)
unet, optimizer = accelerator.prepare(unet, optimizer)

# Prompt template pour WikiArt
PROMPTS = [
    "a painting in the style of impressionism, {subject}, oil on canvas, museum quality",
    "an expressionist artwork, {subject}, bold colors, emotional, fine art",
    "a realistic masterpiece, {subject}, detailed brushwork, classical painting",
    "artwork in the style of wikiart, {subject}, professional, high quality print",
]

SUBJECTS = [
    "landscape with mountains and river",
    "portrait of a woman with flowers",
    "city at night with lights",
    "abstract composition with geometric shapes",
    "still life with fruits and vase",
    "ocean waves at sunset",
]

import random

def get_random_prompt():
    template = random.choice(PROMPTS)
    subject  = random.choice(SUBJECTS)
    return template.format(subject=subject)

print("🚀 Début de l'entraînement EvoPrint LoRA...")
print(f"   Steps: {MAX_STEPS} | LR: {LEARNING_RATE} | Batch: {BATCH_SIZE}x{GRADIENT_ACCUM}")

global_step = 0
losses = []

unet.train()
text_encoder.eval()

for epoch in range(NUM_EPOCHS):
    if global_step >= MAX_STEPS:
        break

    for batch in DataLoader(
        list(dataset_filtre.take(MAX_STEPS * BATCH_SIZE)),
        batch_size=BATCH_SIZE,
        shuffle=True
    ):
        if global_step >= MAX_STEPS:
            break

        with accelerator.accumulate(unet):
            # Préparer les images
            pixel_values = torch.stack([
                transform(img.convert("RGB")) for img in batch["image"]
            ]).to(DEVICE)

            # Encoder les prompts texte
            prompt = get_random_prompt()
            text_inputs = tokenizer(
                prompt,
                padding="max_length",
                max_length=tokenizer.model_max_length,
                truncation=True,
                return_tensors="pt"
            ).input_ids.to(DEVICE)

            with torch.no_grad():
                encoder_hidden_states = text_encoder(text_inputs).last_hidden_state

            # Ajouter du bruit (diffusion forward)
            noise = torch.randn_like(pixel_values)
            timesteps = torch.randint(0, noise_scheduler.num_train_timesteps, (BATCH_SIZE,), device=DEVICE)
            noisy_images = noise_scheduler.add_noise(pixel_values, noise, timesteps)

            # Prédire le bruit
            noise_pred = unet(noisy_images, timesteps, encoder_hidden_states).sample

            # Calculer la loss
            loss = F.mse_loss(noise_pred.float(), noise.float(), reduction="mean")
            accelerator.backward(loss)

            optimizer.step()
            optimizer.zero_grad()

        losses.append(loss.item())
        global_step += 1

        if global_step % 50 == 0:
            avg_loss = sum(losses[-50:]) / 50
            print(f"  Step {global_step}/{MAX_STEPS} | Loss: {avg_loss:.4f}")

        # Sauvegarder checkpoint
        if global_step % SAVE_EVERY == 0:
            ckpt_dir = f"{OUTPUT_DIR}/checkpoint-{global_step}"
            unet.save_pretrained(ckpt_dir)
            print(f"  💾 Checkpoint sauvegardé: {ckpt_dir}")

print(f"\n✅ Entraînement terminé! Loss finale: {sum(losses[-20:])/20:.4f}")

# ═══════════════════════════════════════════════════════════════
# CELLULE 6 — Tester le modèle entraîné
# ═══════════════════════════════════════════════════════════════
from diffusers import StableDiffusionPipeline

print("🧪 Test du modèle EvoPrint...")

pipeline = StableDiffusionPipeline.from_pretrained(
    MODEL_BASE,
    torch_dtype=torch.float16
).to(DEVICE)

# Charger les poids LoRA entraînés
pipeline.unet.load_attn_procs(OUTPUT_DIR)

test_prompts = [
    "a marketing poster for a coffee shop, impressionist style, warm colors, high quality print",
    "business card design with floral motifs, wikiart style, professional",
    "corporate flyer with abstract expressionist background, modern design",
]

for i, prompt in enumerate(test_prompts):
    image = pipeline(
        prompt,
        num_inference_steps=30,
        guidance_scale=7.5,
        width=512, height=512
    ).images[0]

    image.save(f"{OUTPUT_DIR}/test_{i+1}.jpg")
    print(f"  ✅ Image {i+1} générée: test_{i+1}.jpg")

print("\n📸 Images de test sauvegardées dans:", OUTPUT_DIR)

# ═══════════════════════════════════════════════════════════════
# CELLULE 7 — Publier sur HuggingFace Hub
# ═══════════════════════════════════════════════════════════════
from huggingface_hub import HfApi

HF_USERNAME   = "VOTRE_USERNAME_HF"   # ← remplacer
MODEL_NAME    = "evoprint-wikiart-lora"
REPO_ID       = f"{HF_USERNAME}/{MODEL_NAME}"

api = HfApi()

# Créer le repo
api.create_repo(repo_id=REPO_ID, exist_ok=True)

# Uploader les poids LoRA
api.upload_folder(
    folder_path=OUTPUT_DIR,
    repo_id=REPO_ID,
    repo_type="model"
)

print(f"\n🚀 Modèle publié sur HuggingFace!")
print(f"   URL: https://huggingface.co/{REPO_ID}")
print(f"\n   Ajoutez dans back/.env:")
print(f"   EVOPRINT_MODEL_ID={REPO_ID}")
