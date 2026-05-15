const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: './.env' });

async function testNanoBananaFlash() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // Testing the Flash version of Nano Banana (Gemini 3.1 Flash Image)
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" });
    console.log("Attempting to generate image with gemini-3.1-flash-image-preview...");
    
    const result = await model.generateContent("A simple cute cat, 8k");
    const response = await result.response;
    
    if (response.candidates?.[0]?.content?.parts) {
      const hasImage = response.candidates[0].content.parts.some(p => p.inlineData);
      console.log("Has image part:", hasImage);
    } else {
      console.log("No parts in response.");
    }
  } catch (error) {
    console.error("Nano Banana Flash Error:", error.message);
  }
}

testNanoBananaFlash();
