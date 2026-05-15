const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: './.env' });

async function testNanoBanana() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // Using the codename from the list
    const model = genAI.getGenerativeModel({ model: "nano-banana-pro-preview" });
    console.log("Attempting to generate image with nano-banana-pro-preview...");
    
    // For image generation models in Gemini, sometimes the prompt structure is different
    // but usually it follows the same generateContent or a dedicated method
    const result = await model.generateContent("A beautiful futuristic city at night, neon lights, 8k");
    
    // Check if response has an image
    // If it's an image model, the response might contain parts with inlineData (base64)
    const response = await result.response;
    console.log("Response keys:", Object.keys(response));
    console.log("Text if any:", response.text ? response.text() : "No text");
    
    // Check candidate parts
    if (response.candidates?.[0]?.content?.parts) {
      response.candidates[0].content.parts.forEach((part, i) => {
        console.log(`Part ${i} keys:`, Object.keys(part));
        if (part.inlineData) {
          console.log(`Part ${i} has inlineData (image?)`);
        }
      });
    }
  } catch (error) {
    console.error("Nano Banana Error:", error.message);
  }
}

testNanoBanana();
