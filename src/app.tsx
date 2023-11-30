import { useCallback, useEffect, useState } from "preact/hooks";
import ChatBot from "react-simple-chatbot";
import { Forma } from "forma-embedded-view-sdk/auto";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
window.Forma = Forma;

const SHOULD_MOCK = false;

const mockResponse = {
  id: "chatcmpl-8QZiU1aiJ0jhVkghlKNTMqID7IiPH",
  object: "chat.completion",
  created: 1701344514,
  model: "gpt-3.5-turbo-0613",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content:
          "Certainly! Here's an example of how you can create a JavaScript function using Three.js and GLTFExporter to build a `<canvas>` in glb format and return it as a base64 encoded string:\n\n```javascript\nwindow.generate = function() {\n  // Create a scene and add objects\n\n  const scene = new THREE.Scene();\n\n  const geometry = new THREE.BoxGeometry(1, 1, 1);\n  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });\n  const cube = new THREE.Mesh(geometry, material);\n  scene.add(cube);\n\n  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);\n  camera.position.z = 5;\n\n  // Create a renderer\n\n  const renderer = new THREE.WebGLRenderer({ antialias: true });\n  renderer.setSize(window.innerWidth, window.innerHeight);\n  document.body.appendChild(renderer.domElement);\n\n  // Create a GLTFExporter instance and export the scene\n\n  const exporter = new THREE.GLTFExporter();\n\n  return new Promise((resolve) => {\n    exporter.parse(scene, (glb) => {\n      // Encode the glb as base64\n\n      const glbString = JSON.stringify(glb);\n      const glbBytes = new TextEncoder().encode(glbString);\n      const glbBase64 = btoa(String.fromCharCode(...glbBytes));\n\n      resolve(glbBase64);\n    });\n  });\n};\n```\n\nYou can call this function `generate()` to get a base64 encoded string of the scene in glb format. Note that this function returns a promise, so you might need to handle it accordingly. Also, make sure you have the necessary imports and dependencies (e.g., Three.js, GLTFExporter) set up in your project.",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 72,
    completion_tokens: 369,
    total_tokens: 441,
  },
  system_fingerprint: null,
};

function renderPrompt(prompt: string) {
  return `
   Can you create a function called generate in javascript build a ${prompt} in glb format using threejs and return the glb as a base64 encoded string?
   Make THREE and GTLFExporter parameters to the generate function

   You do not need to render just export the scene :) 
   Do not add any usage examples.
   
   Expose the function on window.generate
   `;
}

function extractCode(response: any) {
  const [choice] = response.choices;
  const regex = /```(?:javascript|js)\n([\s\S]+?)```/g;

  return choice?.message.content
    .match(regex)[0]
    .replace("```javascript", "")
    .replace("```", "")
    .replace("```js", "");
}

async function callChatGPT(prompt: string) {
  const apiUrl = "https://api.openai.com/v1/chat/completions";
  const apiKey = "API_KEY";
  const messages = [
    { role: "system", content: "What do you want to draw?" },
    { role: "user", content: prompt },
  ];

  const headers = new Headers({
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  });

  const requestData = {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: messages,
    }),
  };

  try {
    console.log(messages);
    let result;
    if (SHOULD_MOCK) {
      result = mockResponse;
    } else {
      const response = await fetch(apiUrl, requestData);
      result = await response.json();
    }

    const code = extractCode(result);
    console.log(code);
    // Handle the result and display the AI response in your UI
    eval(code);

    //@ts-ignore
    const raw = await window.generate(THREE, GLTFExporter);
    const glb = base64ToArrayBuffer(raw.replace("data:model/gltf-binary;base64,", ""));

    Forma.render.glb.add({ glb });
  } catch (error) {
    console.error("Error making API request:", error);
    // Handle errors
  }
}

function AskGPT({ steps, triggerNextStep }) {
  const prompt = steps?.prompt?.value;
  console.log(renderPrompt(prompt));

  useEffect(() => {
    (async function call() {
      await callChatGPT(renderPrompt(prompt));
      triggerNextStep();
    })();
  }, []);

  return (
    <>
      <div>{JSON.stringify(steps)}</div>
    </>
  );
}

export default function App() {
  return (
    <div style={{ height: "400px" }}>
      <ChatBot
        steps={[
          {
            id: "1",
            message: "What do you want to draw?",
            trigger: "prompt",
          },
          {
            id: "prompt",
            user: true,
            trigger: "3",
          },
          {
            id: "3",
            component: <AskGPT />,
            waitAction: true,
            trigger: "4",
          },
          {
            id: "4",
            message: "Yay!",
            end: true,
          },
        ]}
      />
    </div>
  );
}
