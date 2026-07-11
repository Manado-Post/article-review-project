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

export const config = {
  port: process.env.PORT || 4001,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  mode,
};
