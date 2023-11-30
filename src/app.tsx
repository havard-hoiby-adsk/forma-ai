import { useCallback, useEffect, useState } from "preact/hooks";
import ChatBot from "react-simple-chatbot";
import { Forma } from "forma-embedded-view-sdk/auto";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

window.THREE = THREE;
window.GLTFExporter = GLTFExporter;

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
  id: "chatcmpl-8QcLbnFMkpSFr4r5YSuDrK3KH0mmr",
  object: "chat.completion",
  created: 1701354627,
  model: "gpt-3.5-turbo-0613",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content:
          "Sure! Here's a JavaScript function that generates a Three.js scene with two boxes placed inside the given site boundary at the terrain elevation:\n\n```javascript\nfunction generate(site) {\n  const { WebGLRenderer, Scene, PerspectiveCamera, BoxGeometry, MeshBasicMaterial, Mesh } = THREE;\n\n  const renderer = new WebGLRenderer();\n  renderer.setSize(window.innerWidth, window.innerHeight);\n  document.body.appendChild(renderer.domElement);\n\n  const scene = new Scene();\n  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);\n  camera.position.z = 5;\n\n  const siteBoundary = new BoxGeometry(1, 1, 1);\n  const siteMaterial = new MeshBasicMaterial({ color: 0x0000ff });\n  const siteMesh = new Mesh(siteBoundary, siteMaterial);\n  scene.add(siteMesh);\n\n  const boxGeometry1 = new BoxGeometry(1, 1, 1);\n  const boxMaterial1 = new MeshBasicMaterial({ color: 0xff0000 });\n  const box1 = new Mesh(boxGeometry1, boxMaterial1);\n  box1.position.set(-4, -4, 5.834311802022915);\n  scene.add(box1);\n\n  const boxGeometry2 = new BoxGeometry(1, 1, 1);\n  const boxMaterial2 = new MeshBasicMaterial({ color: 0x00ff00 });\n  const box2 = new Mesh(boxGeometry2, boxMaterial2);\n  box2.position.set(4, 4, 5.834311802022915);\n  scene.add(box2);\n\n  return scene;\n}\n\nwindow.generate = generate;\n```\n\nPlease note that this code assumes you have included the Three.js library in your project. You also need to have a working HTML file to run this code.",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 214,
    completion_tokens: 378,
    total_tokens: 592,
  },
  system_fingerprint: null,
};

function renderPromptTHREE(prompt: string, selectedSite: [number, number][], elevation: number) {
  return `
   Given the site polygon ${JSON.stringify(selectedSite)}

The z elevation of the terrain is ${elevation} meters.

Can you create a function called generate in javascript.
Create a threejs scene.
Add ${prompt} to the scene inside the site boundary.
These boxes should be at the terrain elevation.
Do not add the site boundary to the scene.
return the scene

   Make THREE parameter to the generate function

   You do not need to render just export the scene :) 
   Do not add any usage examples.
   
   Expose the function on window.generate
   `;
}

function renderPrompt(prompt: string, selectedSite: [number, number][]) {
  return `
Given the site boundary ${JSON.stringify(selectedSite)}

Create ${prompt} inside the site boundary without overlapping and with a minimum of 5 meter between each other as geojson. For each building return a polygon with a height property.

Not in javascript print the geojson.
Print the resulting geojson as a FeatureCollection with features
   `;
}

type Geojson = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: {
      type: "Polygon";
      propeties: { height: number };
      coodinates: [number, number][][];
    };
  }[];
};

function extractGeojson(response: any) {
  const [choice] = response.choices;

  return JSON.parse(choice?.message.content);
}

async function callChatGPT(prompt: string) {
  const apiUrl = "https://api.openai.com/v1/chat/completions";
  const apiKey = "";
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
      model: "gpt-4-1106-preview",
      messages: messages,
      response_format: { type: "json_object" },
      seed: 0,
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

    const { features } = extractGeojson(result);

    console.log({ features });

    for (let feature of features) {
      console.log(feature.geometry.coordinates);
      let terrainElevation = await Forma.terrain.getElevationAt({
        x: feature.geometry.coordinates[0][0][0],
        y: feature.geometry.coordinates[0][0][0],
      });
      for (let [x, y] of feature.geometry.coordinates[0]) {
        const elevation = await Forma.terrain.getElevationAt({ x, y });

        if (elevation < terrainElevation) {
          terrainElevation = elevation;
        }
      }

      const floorStack = {
        floors: [
          {
            polygon: feature.geometry.coordinates[0],
            height: feature.properties.height,
          },
        ],
      };

      const { urn } = await Forma.elements.floorStack.createFromFloors(floorStack);

      // prettier-ignore
      const transform = [
        1, 0, 0, 0, 
        0, 1, 0, 0, 
        0, 0, 1, 0, 
        0, 0, terrainElevation, 1
      ];

      await Forma.proposal.addElement({ urn, transform });
    }
  } catch (error) {
    console.error("Error making API request:", error);
    // Handle errors
  }
}

function AskGPT({ steps, triggerNextStep }) {
  const prompt = steps?.prompt?.value;

  useEffect(() => {
    (async function call() {
      const site = await Forma.geometry.getFootprint({
        path: (await Forma.selection.getSelection())[0],
      });

      const [x, y] = site?.coordinates[0];

      let elevation = await Forma.terrain.getElevationAt({ x, y });
      for (let [x, y] of site?.coordinates) {
        const thisElevation = await Forma.terrain.getElevationAt({ x, y });

        if (thisElevation < elevation) {
          elevation = thisElevation;
        }
      }

      await callChatGPT(renderPrompt(prompt, site?.coordinates, elevation));
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
            trigger: "1",
          },
        ]}
      />
    </div>
  );
}
