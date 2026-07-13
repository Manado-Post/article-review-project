import dotenv from "dotenv";
dotenv.config();

// Mode options:
// - 'local': Full heuristic mode (no API call, ~70% accuracy, instant)
// - 'hybrid': Heuristics + LLM for borderline cases (default, ~85% accuracy)
// - 'llm': Full LLM analysis (slower, higher cost, ~95% accuracy)
const validModes = ['local', 'hybrid', 'llm'];
const configuredMode = process.env.MODE?.toLowerCase() || 'hybrid';

const mode = validModes.includes(configuredMode) ? configuredMode : 'hybrid';

if ((mode === 'hybrid' || mode === 'llm') && !process.env.ANTHROPIC_API_KEY) {
  throw new Error(`Mode "${mode}" requires ANTHROPIC_API_KEY environment variable. Set it in .env or use MODE=local.`);
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required. Set it in .env or Render environment variables.");
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters for security.");
}

export const config = {
  port: process.env.PORT || 4001,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  jwtSecret: process.env.JWT_SECRET,
  mode,
};
