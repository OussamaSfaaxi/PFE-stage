const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");

// Load environment variables
require("dotenv").config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth routes
const authRouter = require('./auth');
app.use('/api/auth', authRouter);

// Stripe routes
const stripeRouter = require('./stripe');
app.use('/api/stripe', stripeRouter);

// Gallery routes
const galleryRouter = require('./gallery');
app.use('/api/gallery', galleryRouter);

// Admin routes
const adminRouter = require('./admin');
app.use('/api/admin', adminRouter);

// Initialize AI Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Free Pollinations is limited to 1 image / 45s per IP, which shared hosting IPs always exceed
const pollinationsHeaders = () => ({
  "User-Agent": "EvoPrint/1.0",
  ...(process.env.POLLINATIONS_API_KEY && { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` })
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "EvoPrint* Backend is running" });
});

// ====================== STABILITY AI ======================
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

    const response = await axios.post(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      {
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
        steps: 30
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`
        }
      }
    );

    res.json({
      success: true,
      imageUrl: `data:image/png;base64,${response.data.artifacts[0].base64}`,
      prompt
    });
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error("Stability AI Error:", errorData);
    res.status(500).json({ 
      error: "Erreur Stability AI", 
      message: typeof errorData === 'object' ? JSON.stringify(errorData) : errorData 
    });
  }
});

// ====================== DALL-E 3 ======================
app.post("/api/generate-image-dalle", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    res.json({
      success: true,
      imageUrl: response.data[0].url,
      prompt
    });
  } catch (error) {
    const errMsg = error.message;
    console.error("DALL-E Error:", errMsg);

    if (errMsg.includes("Billing hard limit")) {
      return res.status(400).json({
        error: "Quota OpenAI épuisé",
        message: "Veuillez recharger vos crédits sur platform.openai.com"
      });
    }

    res.status(500).json({ error: "Erreur DALL-E 3", message: errMsg });
  }
});

// ====================== MIDJOURNEY (TTAPI) ======================
app.post("/api/generate-image-midjourney", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

    const imagineRes = await axios.post(
      "https://api.ttapi.io/midjourney/v1/imagine",
      { prompt: prompt, mode: "fast" },
      {
        headers: {
          "Content-Type": "application/json",
          "TT-API-KEY": process.env.MIDJOURNEY_API_KEY
        }
      }
    );

    console.log("Midjourney API Response:", imagineRes.data);

    const taskId = imagineRes.data?.task_id || imagineRes.data?.id || imagineRes.data?.data?.task_id || imagineRes.data?.data?.jobId;
    if (!taskId) {
      throw new Error(`Aucun ID de tâche reçu. Réponse API: ${JSON.stringify(imagineRes.data)}`);
    }

    // Polling logic
    let completed = false;
    let attempts = 0;
    let imageUrl = null;

    while (!completed && attempts < 30) {
      await new Promise(r => setTimeout(r, 4000));
      const statusRes = await axios.get(`https://api.ttapi.io/midjourney/v1/fetch?jobId=${taskId}`, {
        headers: { "TT-API-KEY": process.env.MIDJOURNEY_API_KEY }
      });

      const resData = statusRes.data.data || statusRes.data;
      const status = statusRes.data.status || resData.status || resData.job_status;
      
      if (!status) {
        console.log("Full Midjourney Status Response:", JSON.stringify(statusRes.data));
      }

      console.log(`Job ${taskId} status: ${status}`);

      if (["completed", "success", "finished", "SUCCESS"].includes(status)) {
        imageUrl = resData.images?.[0] || resData.url || resData.image_url;
        completed = true;
      } else if (["failed", "error", "FAILED", "ERROR"].includes(status)) {
        throw new Error("La génération Midjourney a échoué");
      }
      attempts++;
    }

    if (!imageUrl) throw new Error("Délai d'attente Midjourney dépassé");

    res.json({ success: true, imageUrl, prompt });
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error("Midjourney Error:", errorData);

    if (error.response?.status === 402) {
      return res.status(402).json({
        error: "Quota Midjourney épuisé",
        message: "Veuillez recharger vos crédits sur ttapi.io"
      });
    }

    res.status(500).json({ error: "Erreur Midjourney", message: typeof errorData === 'object' ? JSON.stringify(errorData) : errorData });
  }
});

// ====================== NANO BANANA (VIA FAL.AI - FLUX) ======================
app.post("/api/generate-image-nanobanana", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

    console.log("Generating Nano Banana image via Fal.ai (FLUX)...");
    
    const response = await axios.post(
      "https://fal.run/fal-ai/flux/schnell",
      { 
        prompt: prompt,
        image_size: "landscape_4_3",
        num_inference_steps: 4,
        enable_safety_checker: true
      },
      { 
        headers: { 
          "Authorization": `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json"
        } 
      }
    );

    const data = response.data;
    console.log("Fal.ai Response:", data);

    // Fal.ai returns images in an array of objects {url, width, height}
    const imageUrl = data.images?.[0]?.url;
    
    if (!imageUrl) {
      throw new Error("Aucune image renvoyée par Fal.ai. Réponse : " + JSON.stringify(data));
    }

    res.json({
      success: true,
      imageUrl: imageUrl, 
      prompt
    });
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error("Nano Banana (Fal.ai) Error:", errorData);
    
    res.status(500).json({ 
      error: "Erreur Nano Banana via Fal.ai", 
      message: typeof errorData === 'object' ? JSON.stringify(errorData) : errorData 
    });
  }
});

// ====================== EVOPRINT AI (Modèle personnalisé WikiArt) ======================
app.post("/api/generate-image-evoprint", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

    const CUSTOM_MODEL = process.env.EVOPRINT_MODEL_ID;
    const HF_KEY       = process.env.HUGGINGFACE_API_KEY;

    // ── Si le modèle custom est configuré → l'utiliser
    if (CUSTOM_MODEL && HF_KEY) {
      console.log(`✦ EvoPrint AI — modèle personnalisé: ${CUSTOM_MODEL}`);

      // Enrichir le prompt avec le style WikiArt
      const enrichedPrompt = `${prompt}, wikiart style, impressionist painting, fine art, museum quality, print ready, high detail`;

      try {
        const response = await axios.post(
          `https://api-inference.huggingface.co/models/${CUSTOM_MODEL}`,
          { inputs: enrichedPrompt },
          {
            headers: {
              "Authorization": `Bearer ${HF_KEY}`,
              "Content-Type": "application/json",
              "Accept": "image/jpeg"
            },
            responseType: "arraybuffer",
            timeout: 90000
          }
        );
        const base64 = Buffer.from(response.data).toString("base64");
        const ct     = response.headers["content-type"] || "image/jpeg";
        return res.json({
          success: true,
          imageUrl: `data:${ct};base64,${base64}`,
          prompt,
          model: `EvoPrint AI (${CUSTOM_MODEL})`
        });
      } catch (hfErr) {
        console.warn("HuggingFace indisponible, fallback Pollinations...");
      }
    }

    // ── Fallback : Pollinations.ai (FLUX + style wikiart dans le prompt)
    console.log("✦ EvoPrint AI — génération via Pollinations.ai (WikiArt style)...");

    const styledPrompt  = `${prompt}, wikiart impressionist style, fine art painting, museum quality, oil on canvas`;
    const encodedPrompt = encodeURIComponent(styledPrompt);
    const seed          = Math.floor(Math.random() * 1000000);
    const url           = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers: pollinationsHeaders()
    });

    const base64      = Buffer.from(response.data).toString("base64");
    const contentType = response.headers["content-type"] || "image/jpeg";

    res.json({
      success: true,
      imageUrl: `data:${contentType};base64,${base64}`,
      prompt,
      model: "EvoPrint AI (WikiArt FLUX)"
    });

  } catch (error) {
    console.error("EvoPrint AI Error:", error.message);
    res.status(500).json({ error: "Erreur EvoPrint AI", message: error.message });
  }
});

// ====================== FLYER AI (LoRA fine-tuned on CGL-Dataset) ======================
app.post("/api/generate-image-flyerai", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

    const HF_KEY  = process.env.HUGGINGFACE_API_KEY;
    const REPO_ID = "ouussma/flyer-lora-sd15";

    const enrichedPrompt = `flyerprnt style, ${prompt}, professional flyer design, marketing print, high quality, graphic layout`;

    // Pollinations avec trigger word LoRA
    const encodedPrompt = encodeURIComponent(enrichedPrompt);
    const seed = Math.floor(Math.random() * 1000000);
    const url  = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers: pollinationsHeaders()
    });

    const base64      = Buffer.from(response.data).toString("base64");
    const contentType = response.headers["content-type"] || "image/jpeg";

    res.json({
      success: true,
      imageUrl: `data:${contentType};base64,${base64}`,
      prompt,
      model: "FLYER AI (fallback)"
    });
  } catch (error) {
    console.error("FLYER AI Error:", error.message);
    res.status(500).json({ error: "Erreur FLYER AI", message: error.message });
  }
});

// ====================== GEMINI PROMPT ENHANCER ======================
app.post("/api/gemini-context", async (req, res) => {
  const maxRetries = 3;
  let retryCount = 0;

  const attemptGeneration = async () => {
    try {
      const { prompt, context, supportType, sector, language } = req.body;
      if (!prompt) return res.status(400).json({ error: "Le prompt est requis" });

      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

      const systemInstructions = `Tu es un expert en Prompt Engineering et Design Graphique. 
      Ta mission est d'améliorer le prompt de l'utilisateur pour créer un visuel parfaitement adapté à un support spécifique et à un secteur d'activité.
      
      Règles :
      1. Réponds UNIQUEMENT en format JSON.
      2. Le prompt amélioré ("enhancedPrompt") doit être en ANGLAIS, extrêmement détaillé (composition, lumière, style).
      3. Détecte précisément la langue d'origine. Si c'est un mélange, indique "Mélange (ex: Anglais/Allemand)".
      4. Adapte le style visuel au support (${supportType}) et au secteur (${sector}).
      
      Format JSON :
      {
        "detectedLanguage": "langue précise ou mélange",
        "enhancedPrompt": "prompt détaillé en anglais",
        "suggestions": ["conseil 1", "conseil 2", "conseil 3"],
        "note": "explication du style et de l'adaptation au support"
      }`;

      const input = `Prompt original: ${prompt}\nSupport: ${supportType}\nSecteur: ${sector}\nContexte: ${context || 'Aucun'}\nLangue cible: ${language || 'Auto'}`;

      const result = await model.generateContent(systemInstructions + "\n\n" + input);
      const text = result.response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Gemini n'a pas renvoyé de format JSON valide.");
      }
      const data = JSON.parse(jsonMatch[0]);

      res.json({ success: true, ...data });
    } catch (error) {
      if (error.message?.includes("503") && retryCount < maxRetries) {
        retryCount++;
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Gemini 503 error, retrying in ${delay}ms (Attempt ${retryCount}/${maxRetries})...`);
        setTimeout(attemptGeneration, delay);
      } else {
        console.error("Gemini Error:", error.message);
        res.status(500).json({ 
          error: "Erreur Gemini AI", 
          message: error.message.includes("503") 
            ? "Le service est temporairement surchargé. Veuillez réessayer dans quelques instants." 
            : error.message 
        });
      }
    }
  };

  attemptGeneration();
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});