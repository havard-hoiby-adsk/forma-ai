import { useEffect, useState } from "preact/hooks";
import ChatBot from "react-simple-chatbot";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Forma } from "forma-embedded-view-sdk/auto";

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
window.Forma = Forma;

const SHOULD_MOCK = true;

// @ts-ignore
window.THREE = THREE;
// @ts-ignore
window.GLTFExporter = GLTFExporter;

const mockResponse = {
  id: "chatcmpl-8QYMoi5XQgGiAWolceM6DQsa7Bjjr",
  object: "chat.completion",
  created: 1701339326,
  model: "gpt-3.5-turbo-0613",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: `\`\`\`javascript
window.generate = async function() {
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/three@0.132.2/build/three.min.js';
  document.head.appendChild(script);

  await new Promise((resolve) => {
    script.onload = resolve;
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const box = new THREE.Mesh(geometry, material);
  scene.add(box);

  camera.position.z = 5;

  function animate() {
    requestAnimationFrame(animate);
    box.rotation.x += 0.01;
    box.rotation.y += 0.01;
    renderer.render(scene, camera);
  }

  animate();

  const scriptGLTF = document.createElement('script');
  scriptGLTF.src = 'https://unpkg.com/three@0.132.2/examples/js/exporters/GLTFExporter.js';
  document.head.appendChild(scriptGLTF);

  await new Promise((resolve) => {
    scriptGLTF.onload = resolve;
  });

  const gltfExporter = new THREE.GLTFExporter();
  return new Promise((resolve, reject) => {
    gltfExporter.parse(scene, (result) => {
      const glbData = result;
      const blob = new Blob([glbData], { type: 'model/gltf-binary' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = function () {
        const base64data = reader.result;
        resolve(base64data);
      };
    }, { binary: true });
  });
};\`\`\`
`,
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 49,
    completion_tokens: 394,
    total_tokens: 443,
  },
  system_fingerprint: null,
};

function renderPrompt(prompt: string) {
  return `can you create a javascript function to build a ${prompt} in glb format using threejs and return it as a base64 encoded string?
   assume that THREE and GLTFExporter is already imported and available in the global scope window
   Can put the function on window.generate`;
}

function extractCode(response: any) {
  const [choice] = response.choices;
  return choice?.message.content.split("```")[1].replace("javascript", "");
}

async function callChatGPT(prompt: string) {
  const apiUrl = "https://api.openai.com/v1/chat/completions";
  const apiKey = "YOUR_API_KEY";
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
    const raw = await window.generate();
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
