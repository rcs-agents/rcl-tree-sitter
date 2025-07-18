#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

interface DemoOutput {
  messages: Record<string, any>;
  flows: Record<string, any>;
  agent: any;
}

function parseRCLDemo(content: string): DemoOutput {
  const lines = content.split('\n');
  const result: DemoOutput = {
    messages: {},
    flows: {},
    agent: { name: 'UnknownAgent' },
  };

  let currentSection = '';
  let agentName = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Agent definition
    if (trimmed.startsWith('agent ')) {
      agentName = trimmed.replace('agent ', '');
      result.agent.name = agentName;
      currentSection = 'agent';
      continue;
    }

    // Display name
    if (trimmed.startsWith('display-name:')) {
      result.agent.displayName = trimmed.replace('display-name:', '').trim().replace(/['"]/g, '');
      continue;
    }

    // Flow section
    if (trimmed.startsWith('flow ')) {
      const flowName = trimmed.replace('flow ', '');
      currentSection = 'flow';
      result.flows[flowName] = {
        id: flowName,
        initial: 'start',
        states: {},
      };
      continue;
    }

    // Messages section
    if (trimmed === 'messages') {
      currentSection = 'messages';
      continue;
    }

    // Parse flow transitions
    if (currentSection === 'flow' && trimmed.includes('->')) {
      const [from, to] = trimmed.split('->').map((s) => s.trim());
      // Add to current flow
      const currentFlow = Object.values(result.flows)[
        Object.values(result.flows).length - 1
      ] as any;
      if (currentFlow) {
        if (!currentFlow.states[from]) {
          currentFlow.states[from] = { on: {} };
        }
        currentFlow.states[from].on.NEXT = to;

        if (!currentFlow.states[to]) {
          currentFlow.states[to] = {};
        }
      }
    }

    // Parse messages
    if (currentSection === 'messages' && trimmed.includes(':')) {
      const [id, text] = trimmed.split(':').map((s) => s.trim());
      result.messages[id] = {
        contentMessage: {
          text: text.replace(/['"]/g, ''),
        },
        messageTrafficType: 'TRANSACTION',
      };
    }

    // Parse text shortcuts
    if (trimmed.startsWith('text ')) {
      const parts = trimmed.split(' ');
      if (parts.length >= 3) {
        const id = parts[1];
        const text = parts.slice(2).join(' ').replace(/['"]/g, '');
        result.messages[id] = {
          contentMessage: {
            text: text,
          },
          messageTrafficType: 'TRANSACTION',
        };
      }
    }
  }

  return result;
}

function generateJavaScript(output: DemoOutput): string {
  return `// Generated by RCL CLI Demo
export const messages = ${JSON.stringify(output.messages, null, 2)};

export const flows = ${JSON.stringify(output.flows, null, 2)};

export const agent = ${JSON.stringify(output.agent, null, 2)};

// Utility functions
export function getMessage(id) {
  return messages[id] || undefined;
}

export function getFlow(id) {
  return flows[id] || undefined;
}

export default { messages, flows, agent, getMessage, getFlow };
`;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node demo.js <input.rcl> [output.js]');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace('.rcl', '.js');

  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    const parsed = parseRCLDemo(content);
    const jsOutput = generateJavaScript(parsed);

    fs.writeFileSync(outputPath, jsOutput);

    console.log('✓ Successfully compiled RCL file');
    console.log(`  Input:  ${inputPath}`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Agent:  ${parsed.agent.name}`);
    console.log(`  Messages: ${Object.keys(parsed.messages).length}`);
    console.log(`  Flows: ${Object.keys(parsed.flows).length}`);
  } catch (error) {
    console.error('✗ Compilation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
