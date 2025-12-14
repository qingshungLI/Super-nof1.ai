import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { HttpsProxyAgent } from "https-proxy-agent";

// Configure proxy for AI SDK
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || "http://127.0.0.1:7890";
const proxyAgent = new HttpsProxyAgent(proxyUrl);

const deepseekModel = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
  fetch: (url, init) => {
    return fetch(url, {
      ...init,
      // @ts-expect-error - agent is valid but not in types
      agent: proxyAgent,
    });
  },
});



export const deepseekR1 = deepseekModel("deepseek-reasoner");

export const deepseek = deepseekModel("deepseek-chat");

export const deepseekThinking = deepseekModel("deepseek-reasoner");
