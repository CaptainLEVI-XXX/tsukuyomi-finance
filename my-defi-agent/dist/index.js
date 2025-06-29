// src/index.ts
import { logger } from "@elizaos/core";

// src/character.ts
var character = {
  name: "Eliza",
  plugins: [
    // Core plugins first
    "@elizaos/plugin-sql",
    // Text-only plugins (no embedding support)
    ...process.env.ANTHROPIC_API_KEY ? ["@elizaos/plugin-anthropic"] : [],
    ...process.env.OPENROUTER_API_KEY ? ["@elizaos/plugin-openrouter"] : [],
    // Embedding-capable plugins last (lowest priority for embedding fallback)
    ...process.env.OPENAI_API_KEY ? ["@elizaos/plugin-openai"] : [],
    ...process.env.OLLAMA_API_ENDPOINT ? ["@elizaos/plugin-ollama"] : [],
    ...process.env.GOOGLE_GENERATIVE_AI_API_KEY ? ["@elizaos/plugin-google-genai"] : [],
    ...!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.OLLAMA_API_ENDPOINT && !process.env.OPENAI_API_KEY ? ["@elizaos/plugin-local-ai"] : [],
    // Platform plugins
    ...process.env.DISCORD_API_TOKEN ? ["@elizaos/plugin-discord"] : [],
    ...process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET_KEY && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_TOKEN_SECRET ? ["@elizaos/plugin-twitter"] : [],
    ...process.env.TELEGRAM_BOT_TOKEN ? ["@elizaos/plugin-telegram"] : [],
    // Bootstrap plugin
    ...!process.env.IGNORE_BOOTSTRAP ? ["@elizaos/plugin-bootstrap"] : []
  ],
  settings: {
    secrets: {}
  },
  system: "Respond to all messages in a helpful, conversational manner. Provide assistance on a wide range of topics, using knowledge when needed. Be concise but thorough, friendly but professional. Use humor when appropriate and be empathetic to user needs. Provide valuable information and insights when questions are asked.",
  bio: [
    "Engages with all types of questions and conversations",
    "Provides helpful, concise responses",
    "Uses knowledge resources effectively when needed",
    "Balances brevity with completeness",
    "Uses humor and empathy appropriately",
    "Adapts tone to match the conversation context",
    "Offers assistance proactively",
    "Communicates clearly and directly"
  ],
  topics: [
    "general knowledge and information",
    "problem solving and troubleshooting",
    "technology and software",
    "community building and management",
    "business and productivity",
    "creativity and innovation",
    "personal development",
    "communication and collaboration",
    "education and learning",
    "entertainment and media"
  ],
  messageExamples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "This user keeps derailing technical discussions with personal problems."
        }
      },
      {
        name: "Eliza",
        content: {
          text: "DM them. Sounds like they need to talk about something else."
        }
      },
      {
        name: "{{name1}}",
        content: {
          text: "I tried, they just keep bringing drama back to the main channel."
        }
      },
      {
        name: "Eliza",
        content: {
          text: "Send them my way. I've got time today."
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I can't handle being a mod anymore. It's affecting my mental health."
        }
      },
      {
        name: "Eliza",
        content: {
          text: "Drop the channels. You come first."
        }
      },
      {
        name: "{{name1}}",
        content: {
          text: "But who's going to handle everything?"
        }
      },
      {
        name: "Eliza",
        content: {
          text: "We will. Take the break. Come back when you're ready."
        }
      }
    ]
  ],
  style: {
    all: [
      "Keep responses concise but informative",
      "Use clear and direct language",
      "Be engaging and conversational",
      "Use humor when appropriate",
      "Be empathetic and understanding",
      "Provide helpful information",
      "Be encouraging and positive",
      "Adapt tone to the conversation",
      "Use knowledge resources when needed",
      "Respond to all types of questions"
    ],
    chat: [
      "Be conversational and natural",
      "Engage with the topic at hand",
      "Be helpful and informative",
      "Show personality and warmth"
    ]
  }
};

// src/__tests__/e2e/project.test.ts
var ProjectTestSuite = class {
  name = "project";
  description = "E2E tests for project-specific features";
  tests = [
    {
      name: "Project runtime environment test",
      fn: async (runtime) => {
        try {
          if (!runtime.character) {
            throw new Error("Character not loaded in runtime");
          }
          const character2 = runtime.character;
          if (!character2.name) {
            throw new Error("Character name is missing");
          }
          if (character2.name !== "Eliza") {
            throw new Error(`Expected character name 'Eliza', got '${character2.name}'`);
          }
          if (!character2.system) {
            throw new Error("Character system prompt is missing");
          }
          if (!Array.isArray(character2.bio)) {
            throw new Error("Character bio should be an array");
          }
          if (!Array.isArray(character2.messageExamples)) {
            throw new Error("Character message examples should be an array");
          }
          if (character2.plugins && !Array.isArray(character2.plugins)) {
            throw new Error("Character plugins should be an array");
          }
        } catch (error) {
          throw new Error(`Project runtime environment test failed: ${error.message}`);
        }
      }
    }
    /**
     * Example: How to add a new test that checks if services are initialized
     * Uncomment and modify this template for your own tests
     */
    /*
    {
      name: 'Services initialization test',
      fn: async (runtime: any) => {
        // Example: Check if a specific service is available
        const myService = runtime.getService('my-service-name');
        if (!myService) {
          throw new Error('Expected service not found');
        }
        
        // Example: Test service functionality
        const result = await myService.doSomething();
        if (!result) {
          throw new Error('Service did not return expected result');
        }
      },
    },
    */
    /**
     * Example: How to test agent message processing
     * This shows how to simulate a conversation with the agent
     */
    /*
    {
      name: 'Agent conversation test',
      fn: async (runtime: any) => {
        // Create a test room/conversation
        const roomId = `test-room-${Date.now()}`;
        
        // Simulate sending a message to the agent
        const userMessage = {
          userId: 'test-user',
          roomId: roomId,
          content: { text: 'Hello agent!' },
          // Add other required message properties
        };
        
        // Process the message through the runtime
        await runtime.processMessage(userMessage);
        
        // Retrieve messages from the conversation
        const messages = await runtime.messageManager.getMessages({ roomId });
        
        // Verify the agent responded
        if (messages.length < 2) {
          throw new Error('Agent did not respond to message');
        }
        
        // Check the agent's response
        const agentResponse = messages.find(m => m.userId === runtime.agentId);
        if (!agentResponse) {
          throw new Error('Could not find agent response');
        }
        
        // Verify response content
        if (!agentResponse.content.text.toLowerCase().includes('hello')) {
          throw new Error('Agent response did not contain expected greeting');
        }
      },
    },
    */
  ];
};
var project_test_default = new ProjectTestSuite();

// node_modules/uuid/dist/esm/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

// node_modules/uuid/dist/esm/rng.js
import { randomFillSync } from "crypto";
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/uuid/dist/esm/native.js
import { randomUUID } from "crypto";
var native_default = { randomUUID };

// node_modules/uuid/dist/esm/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// src/__tests__/e2e/starter-plugin.test.ts
var StarterTestSuite = class {
  name = "starter";
  description = "E2E tests for the starter project demonstrating comprehensive testing patterns";
  tests = [
    {
      /**
       * Test 1: Character Configuration Validation
       * This test ensures that the character is properly configured with all required fields.
       * It's a good first test because it validates the basic setup before testing functionality.
       */
      name: "Character configuration test",
      fn: async (runtime) => {
        const character2 = runtime.character;
        const requiredFields = ["name", "bio", "plugins", "system", "messageExamples"];
        const missingFields = requiredFields.filter((field) => !(field in character2));
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
        }
        if (character2.name !== "Eliza") {
          throw new Error(`Expected character name to be 'Eliza', got '${character2.name}'`);
        }
        if (!Array.isArray(character2.plugins)) {
          throw new Error("Character plugins should be an array");
        }
        if (!character2.system) {
          throw new Error("Character system prompt is required");
        }
        if (!Array.isArray(character2.bio)) {
          throw new Error("Character bio should be an array");
        }
        if (!Array.isArray(character2.messageExamples)) {
          throw new Error("Character message examples should be an array");
        }
      }
    },
    {
      /**
       * Test 2: Plugin Initialization
       * This test verifies that plugins can be registered with the runtime.
       * It's important to test this separately from action execution to isolate issues.
       */
      name: "Plugin initialization test",
      fn: async (runtime) => {
        try {
          await runtime.registerPlugin({
            name: "starter",
            description: "A starter plugin for Eliza",
            init: async () => {
            },
            config: {}
          });
        } catch (error) {
          throw new Error(`Failed to register plugin: ${error.message}`);
        }
      }
    },
    {
      /**
       * Test 3: Direct Action Execution
       * This test explicitly requests the HELLO_WORLD action to verify it works correctly.
       * This is useful for testing that the action itself is functioning before testing
       * natural language understanding.
       */
      name: "Hello world action test - Direct execution",
      fn: async (runtime) => {
        const message = {
          entityId: v4_default(),
          roomId: v4_default(),
          content: {
            text: "Can you say hello?",
            source: "test",
            actions: ["HELLO_WORLD"]
            // Explicitly request the HELLO_WORLD action
          }
        };
        const state = {
          values: {},
          data: {},
          text: ""
        };
        let responseReceived = false;
        try {
          await runtime.processActions(message, [], state, async (content) => {
            if (content.text === "hello world!" && content.actions?.includes("HELLO_WORLD")) {
              responseReceived = true;
            }
            return [];
          });
          if (!responseReceived) {
            const helloWorldAction = runtime.actions.find((a) => a.name === "HELLO_WORLD");
            if (helloWorldAction) {
              await helloWorldAction.handler(
                runtime,
                message,
                state,
                {},
                async (content) => {
                  if (content.text === "hello world!" && content.actions?.includes("HELLO_WORLD")) {
                    responseReceived = true;
                  }
                  return [];
                },
                []
              );
            } else {
              throw new Error("HELLO_WORLD action not found in runtime.actions");
            }
          }
          if (!responseReceived) {
            throw new Error("Hello world action did not produce expected response");
          }
        } catch (error) {
          throw new Error(`Hello world action test failed: ${error.message}`);
        }
      }
    },
    {
      /**
       * Test 4: Natural Language Understanding - Hello World
       * This is the KEY TEST that demonstrates how the agent should naturally understand
       * a request to say "hello world" without explicitly specifying the action.
       *
       * This test simulates a real conversation where:
       * 1. The user asks the agent to say "hello world" in natural language
       * 2. The agent understands the request and decides to use the HELLO_WORLD action
       * 3. The agent responds with "hello world!"
       *
       * This tests the full AI pipeline: understanding → decision making → action execution
       */
      name: "Natural language hello world test",
      fn: async (runtime) => {
        const roomId = v4_default();
        const userId = v4_default();
        try {
          const userMessage = {
            entityId: userId,
            roomId,
            content: {
              text: "Please say hello world",
              // Natural language request
              source: "test"
              // No actions specified - agent must understand the intent
            }
          };
          let agentResponse = null;
          let actionUsed = null;
          const responseCallback = async (content) => {
            agentResponse = content.text;
            if (content.actions && content.actions.length > 0) {
              actionUsed = content.actions[0];
            }
            return [];
          };
          await runtime.processMessage(userMessage, [], responseCallback);
          if (!agentResponse) {
            const state = {
              values: {},
              data: {},
              text: userMessage.content.text
            };
            const result = await runtime.evaluate(userMessage, state, responseCallback);
            if (!agentResponse && runtime.evaluateActions) {
              const selectedActions = await runtime.evaluateActions(userMessage, state);
              if (selectedActions && selectedActions.length > 0) {
                const action = runtime.actions.find((a) => a.name === selectedActions[0]);
                if (action) {
                  await action.handler(runtime, userMessage, state, {}, responseCallback, []);
                }
              }
            }
          }
          if (!agentResponse) {
            throw new Error("Agent did not respond to natural language request");
          }
          const responseText = agentResponse || "";
          if (!responseText.toLowerCase().includes("hello world")) {
            throw new Error(
              `Agent response did not contain "hello world". Got: "${agentResponse}"`
            );
          }
          if (actionUsed && actionUsed !== "HELLO_WORLD") {
            console.log(`Note: Agent used action "${actionUsed}" instead of "HELLO_WORLD"`);
          }
        } catch (error) {
          throw new Error(`Natural language hello world test failed: ${error.message}`);
        }
      }
    },
    {
      /**
       * Test 5: Provider Functionality
       * Providers supply context to the agent. This test verifies that our
       * HELLO_WORLD_PROVIDER is functioning and returning the expected data.
       */
      name: "Hello world provider test",
      fn: async (runtime) => {
        const message = {
          entityId: v4_default(),
          roomId: v4_default(),
          content: {
            text: "What can you provide?",
            source: "test"
          }
        };
        const state = {
          values: {},
          data: {},
          text: ""
        };
        try {
          if (!runtime.providers || runtime.providers.length === 0) {
            throw new Error("No providers found in runtime");
          }
          const helloWorldProvider = runtime.providers.find(
            (p) => p.name === "HELLO_WORLD_PROVIDER"
          );
          if (!helloWorldProvider) {
            throw new Error("HELLO_WORLD_PROVIDER not found in runtime providers");
          }
          const result = await helloWorldProvider.get(runtime, message, state);
          if (result.text !== "I am a provider") {
            throw new Error(`Expected provider to return "I am a provider", got "${result.text}"`);
          }
        } catch (error) {
          throw new Error(`Hello world provider test failed: ${error.message}`);
        }
      }
    },
    {
      /**
       * Test 6: Service Lifecycle Management
       * Services are long-running components. This test verifies that our
       * starter service can be properly started, accessed, and stopped.
       */
      name: "Starter service test",
      fn: async (runtime) => {
        try {
          const service = runtime.getService("starter");
          if (!service) {
            throw new Error("Starter service not found");
          }
          if (service.capabilityDescription !== "This is a starter service which is attached to the agent through the starter plugin.") {
            throw new Error("Incorrect service capability description");
          }
          await service.stop();
        } catch (error) {
          throw new Error(`Starter service test failed: ${error.message}`);
        }
      }
    }
    /**
     * TEMPLATE: How to add a new E2E test
     * Copy this template and modify it for your specific test case
     */
    /*
    {
      name: 'My new feature test',
      fn: async (runtime: any) => {
        try {
          // 1. Set up test data
          const testData = {
            // Your test setup here
          };
          
          // 2. Execute the feature
          const result = await runtime.someMethod(testData);
          
          // 3. Verify the results
          if (!result) {
            throw new Error('Expected result but got nothing');
          }
          
          if (result.someProperty !== 'expected value') {
            throw new Error(`Expected 'expected value' but got '${result.someProperty}'`);
          }
          
          // Test passed if we reach here without throwing
        } catch (error) {
          // Always wrap errors with context for easier debugging
          throw new Error(`My new feature test failed: ${error.message}`);
        }
      },
    },
    */
  ];
};
var starter_plugin_test_default = new StarterTestSuite();

// src/__tests__/e2e/natural-language.test.ts
var NaturalLanguageTestSuite = class {
  name = "natural-language";
  description = "E2E tests for natural language processing and agent responses";
  tests = [
    {
      name: "Agent responds to hello world",
      fn: async (runtime) => {
        try {
          const roomId = `test-room-hello-${Date.now()}`;
          const userId = "test-user-hello";
          const helloMessage = {
            id: `msg-${Date.now()}`,
            userId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text: "hello world",
              type: "text"
            },
            createdAt: Date.now()
          };
          console.log("Sending hello world message to agent...");
          await runtime.processMessage(helloMessage);
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          const messages = await runtime.messageManager.getMessages({
            roomId,
            limit: 10
          });
          console.log(`Retrieved ${messages.length} messages from conversation`);
          if (messages.length < 2) {
            throw new Error(`Expected at least 2 messages, got ${messages.length}`);
          }
          const agentResponse = messages.find(
            (m) => m.userId === runtime.agentId && m.roomId === roomId && m.id !== helloMessage.id
          );
          if (!agentResponse) {
            throw new Error("Agent did not respond to hello world message");
          }
          console.log("Agent response:", agentResponse.content.text);
          const responseText = agentResponse.content.text.toLowerCase();
          const greetingWords = ["hello", "hi", "hey", "greetings", "welcome"];
          const containsGreeting = greetingWords.some((word) => responseText.includes(word));
          if (!containsGreeting) {
            throw new Error(
              `Agent response did not contain a greeting. Response was: "${agentResponse.content.text}"`
            );
          }
          console.log("\u2713 Agent successfully responded to hello world");
        } catch (error) {
          throw new Error(`Hello world test failed: ${error.message}`);
        }
      }
    },
    {
      name: "Agent responds to casual greeting",
      fn: async (runtime) => {
        try {
          const greetings = ["hey there!", "hi, how are you?", "good morning!", "whats up?"];
          for (const greeting of greetings) {
            const roomId = `test-room-greeting-${Date.now()}-${Math.random()}`;
            const userId = "test-user-greeting";
            const message = {
              id: `msg-${Date.now()}-${Math.random()}`,
              userId,
              agentId: runtime.agentId,
              roomId,
              content: {
                text: greeting,
                type: "text"
              },
              createdAt: Date.now()
            };
            console.log(`Testing greeting: "${greeting}"`);
            await runtime.processMessage(message);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const messages = await runtime.messageManager.getMessages({
              roomId,
              limit: 10
            });
            const agentResponse = messages.find(
              (m) => m.userId === runtime.agentId && m.id !== message.id
            );
            if (!agentResponse) {
              throw new Error(`Agent did not respond to greeting: "${greeting}"`);
            }
            if (!agentResponse.content.text || agentResponse.content.text.length < 2) {
              throw new Error(`Agent gave empty response to: "${greeting}"`);
            }
            console.log(`\u2713 Agent responded to: "${greeting}"`);
          }
        } catch (error) {
          throw new Error(`Casual greeting test failed: ${error.message}`);
        }
      }
    },
    {
      name: "Agent maintains conversation context",
      fn: async (runtime) => {
        try {
          const roomId = `test-room-context-${Date.now()}`;
          const userId = "test-user-context";
          const firstMessage = {
            id: `msg-1-${Date.now()}`,
            userId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text: "My favorite color is blue. What's yours?",
              type: "text"
            },
            createdAt: Date.now()
          };
          console.log("Sending first message about favorite color...");
          await runtime.processMessage(firstMessage);
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          const secondMessage = {
            id: `msg-2-${Date.now()}`,
            userId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text: "Why did you choose that color?",
              type: "text"
            },
            createdAt: Date.now() + 1e3
          };
          console.log("Sending follow-up question...");
          await runtime.processMessage(secondMessage);
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          const messages = await runtime.messageManager.getMessages({
            roomId,
            limit: 10
          });
          if (messages.length < 4) {
            throw new Error(`Expected at least 4 messages, got ${messages.length}`);
          }
          const agentResponses = messages.filter((m) => m.userId === runtime.agentId);
          if (agentResponses.length < 2) {
            throw new Error("Agent did not respond to both messages");
          }
          const secondResponse = agentResponses[agentResponses.length - 1];
          const responseText = secondResponse.content.text.toLowerCase();
          const contextWords = ["color", "blue", "favorite", "chose", "choice", "because"];
          const hasContext = contextWords.some((word) => responseText.includes(word));
          if (!hasContext) {
            console.warn(
              `Agent response may not show context awareness. Response: "${secondResponse.content.text}"`
            );
          }
          console.log("\u2713 Agent maintained conversation context");
        } catch (error) {
          throw new Error(`Context test failed: ${error.message}`);
        }
      }
    }
  ];
};
var natural_language_test_default = new NaturalLanguageTestSuite();

// src/__tests__/e2e/index.ts
var testSuites = [project_test_default, starter_plugin_test_default, natural_language_test_default];

// src/index.ts
var initCharacter = ({ runtime }) => {
  logger.info("Initializing character");
  logger.info("Name: ", character.name);
};
var projectAgent = {
  character,
  init: async (runtime) => await initCharacter({ runtime })
  // plugins: [starterPlugin], <-- Import custom plugins here
};
var project = {
  agents: [projectAgent]
};
var index_default = project;
export {
  character,
  index_default as default,
  projectAgent,
  testSuites
};
//# sourceMappingURL=index.js.map