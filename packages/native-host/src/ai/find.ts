/**
 * AI-powered element finder using natural language.
 * Uses Anthropic Claude to find elements based on descriptions.
 * Updated for AI SDK v6.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

export interface FindOptions {
  /**
   * Natural language description of the element to find.
   */
  query: string;

  /**
   * Accessibility tree snapshot of the page.
   */
  accessibilityTree: string;

  /**
   * Optional screenshot for visual context (base64).
   */
  screenshot?: string;

  /**
   * API key for Anthropic (defaults to ANTHROPIC_API_KEY env var).
   */
  apiKey?: string;

  /**
   * Model to use (defaults to claude-sonnet-4-20250514).
   */
  model?: string;
}

export interface FindResult {
  /**
   * Reference IDs of matching elements.
   */
  refs: string[];

  /**
   * Confidence score (0-1).
   */
  confidence: number;

  /**
   * Explanation of the match.
   */
  reasoning: string;
}

// Schema for the structured output
const FindResultSchema = z.object({
  refs: z.array(z.string()).describe("Array of element reference IDs that match the query"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
  reasoning: z.string().describe("Brief explanation of why these elements match"),
});

const FIND_SYSTEM_PROMPT = `You are an expert at finding UI elements on web pages. You will be given:
1. An accessibility tree representation of a web page
2. A natural language description of an element to find

The accessibility tree format is:
[ref_N] role "accessible name"

Where:
- ref_N is a unique identifier for the element
- role is the ARIA role (button, link, textbox, etc.)
- "accessible name" is the label or text content

Your task is to find the element(s) that best match the user's description.

IMPORTANT RULES:
1. Only return refs that exist in the accessibility tree
2. If no element matches, return an empty array for refs
3. Be precise - prefer exact matches over partial matches
4. For ambiguous queries, return the most likely match first
5. Consider both the role and the accessible name when matching`;

/**
 * Find elements matching a natural language description.
 */
export async function findElements(options: FindOptions): Promise<FindResult> {
  const { query, accessibilityTree, screenshot, apiKey, model = "claude-sonnet-4-20250514" } = options;

  const anthropic = createAnthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  // Build the user prompt
  let userPrompt = `Find the element(s) matching this description: "${query}"

Accessibility Tree:
${accessibilityTree}`;

  // Build messages with optional image
  type MessageContent = string | Array<{ type: "text"; text: string } | { type: "image"; image: string }>;
  const messages: Array<{ role: "user"; content: MessageContent }> = [];

  if (screenshot) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          image: `data:image/png;base64,${screenshot}`,
        },
        {
          type: "text",
          text: userPrompt,
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: userPrompt,
    });
  }

  try {
    // Use AI SDK v6 structured output with generateText
    const response = await generateText({
      model: anthropic(model),
      system: FIND_SYSTEM_PROMPT,
      messages,
      maxOutputTokens: 1024,
      output: Output.object({
        schema: FindResultSchema,
      }),
    });

    // Access structured output directly (AI SDK v6)
    const result = response.output;

    if (!result) {
      return {
        refs: [],
        confidence: 0,
        reasoning: "Failed to parse response",
      };
    }

    // Validate refs exist in the tree
    const validRefs = result.refs.filter((ref: string) => accessibilityTree.includes(`[${ref}]`));

    return {
      refs: validRefs,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to find elements: ${message}`);
  }
}

/**
 * Find a single element matching a description.
 * Throws if no element is found.
 */
export async function findElement(options: FindOptions): Promise<{ ref: string; confidence: number; reasoning: string }> {
  const result = await findElements(options);

  if (result.refs.length === 0) {
    throw new Error(`No element found matching: ${options.query}`);
  }

  return {
    ref: result.refs[0],
    confidence: result.confidence,
    reasoning: result.reasoning,
  };
}

/**
 * Check if an element exists matching a description.
 */
export async function elementExists(options: FindOptions): Promise<boolean> {
  try {
    const result = await findElements(options);
    return result.refs.length > 0 && result.confidence > 0.5;
  } catch {
    return false;
  }
}
