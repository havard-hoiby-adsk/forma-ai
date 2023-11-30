import { useEffect, useState } from "preact/hooks";
import ChatBot from "react-simple-chatbot";
import { Forma } from "forma-embedded-view-sdk/auto";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

window.THREE = THREE;
window.GLTFExporter = GLTFExporter;
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

function renderPrompt(prompt: string, selectedSite: [number, number][]) {
  return `
Given the site boundary ${JSON.stringify(selectedSite)}

Create ${prompt} inside the site boundary without overlapping and with a minimum of 5 meter between each other as geojson. 
For each building return a feature with type "Polygon" with a height and a numberOfFloors property.
For each road return a feature with type LineString.

Do not include buildings if they are not mentioned in the prompt.
Do not include roads if they are not mentioned in the prompt.

Not in javascript print the geojson.
Print the resulting geojson as a FeatureCollection with features
   `;
}

type Geojson = {
  type: "FeatureCollection";
  features: (
    | {
        type: "Feature";
        properties: { height: number };
        geometry: {
          type: "Polygon";
          coordinates: [number, number][][];
        };
      }
    | {
        type: "Feature";
        geometry: {
          type: "LineString";
          coordinates: [number, number][];
        };
      }
  )[];
};

function extractGeojson(response: any): Geojson {
  const [choice] = response.choices;

  return JSON.parse(choice?.message.content);
}

async function callChatGPT(prompt: string, apiKey: string) {
  const apiUrl = "https://api.openai.com/v1/chat/completions";
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

    for (let feature of features) {
      if (feature.geometry.type === "Polygon") {
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

        let floorStack = {};

        if (feature?.properties?.numberOfFloors) {
          const floors = [];
          for (let i = 0; i < feature?.properties?.numberOfFloors; i++) {
            floors.push({
              polygon: feature.geometry.coordinates[0],
              height: (feature?.properties?.height || 10) / feature?.properties?.numberOfFloors,
            });
          }

          floorStack = {
            floors,
          };
        } else {
          floorStack = {
            floors: [
              {
                polygon: feature.geometry.coordinates[0],
                height: feature?.properties?.height || 10,
              },
            ],
          };
        }

        const { urn } = await Forma.elements.floorStack.createFromFloors(floorStack);

        // prettier-ignore
        const transform = [
        1, 0, 0, 0, 
        0, 1, 0, 0, 
        0, 0, 1, 0, 
        0, 0, terrainElevation, 1
      ];

        await Forma.proposal.addElement({ urn, transform });
      } else {
        const { urn } = await Forma.integrateElements.createElementHierarchy({
          data: {
            rootElement: "root",
            elements: {
              root: {
                id: "root",
                properties: {
                  geometry: {
                    type: "Inline",
                    format: "GeoJSON",
                    geoJson: {
                      type: "FeatureCollection",
                      features: [feature],
                    },
                  },
                },
              },
            },
          },
        });

        await Forma.proposal.addElement({ urn });
      }
    }
  } catch (error) {
    console.error("Error making API request:", error);
    // Handle errors
  }
}

function AskGPT({ steps, triggerNextStep }) {
  const prompt = steps?.prompt?.value;
  const key = steps?.inputkey?.value;

  useEffect(() => {
    (async function call() {
      try {
        const site = await Forma.geometry.getFootprint({
          path: (await Forma.selection.getSelection())[0],
        });

        if (site) {
          await callChatGPT(renderPrompt(prompt, site?.coordinates), key);
        }
        triggerNextStep({ value: "success" });
        return;
      } catch (error) {
        console.error(error);
        triggerNextStep({ value: "failed" });
        return;
      }
    })();
  }, []);

  return (
    <>
      <div>
        <h1>Thinking ... </h1>
        This can take up to 2 minutes. Please wait. If you think it failed close the Extension and
        try again.
      </div>
    </>
  );
}

export default function App() {
  return (
    <div style={{ height: "400px" }}>
      <ChatBot
        steps={[
          {
            id: "0",
            message: "Welcome to the Forma ChatBot!",
            trigger: "getname",
          },
          {
            id: "getname",
            message: "What is your name?",
            trigger: "inputname",
          },
          {
            id: "inputname",
            user: true,
            trigger: "displayname",
          },
          {
            id: "displayname",
            message: "Hi {previousValue}, nice to meet you!",
            trigger: "shorthelp",
          },
          {
            id: "shorthelp",
            message: "I know how to generate buildings and roads. An example prompt would be: ",
            trigger: "example1",
          },
          {
            id: "example1",
            message:
              "five buildings on a row with a height of 10, 11, 12, 10, 12 meters and 10 floors each",
            trigger: "whattodo",
          },
          {
            id: "whattodo",
            message: "What do you want to do?",
            trigger: "generate-or-learn",
          },
          {
            id: "generate-or-learn",
            options: [
              { value: 1, label: "Learn more", trigger: "longhelp" },
              { value: 2, label: "Generate", trigger: "getkey" },
            ],
          },
          {
            id: "longhelp",
            message:
              "I know about the words building, road, height, and floors. Some example prompts are:",
            trigger: "example2",
          },
          {
            id: "example2",
            message: "- a building with 5 floors and 2.5 floor height",
            trigger: "example3",
          },
          {
            id: "example3",
            message: "- a 20x20x10 building in each corner of the site",
            trigger: "example4",
          },
          {
            id: "example4",
            message: "- a pentagon building in the center of the site",
            trigger: "getkey",
          },
          {
            id: "getkey",
            message: "First, I need your ChatGPT API key?",
            trigger: "inputkey",
          },
          {
            id: "inputkey",
            user: true,
            trigger: "1",
          },
          {
            id: "1",
            message: "Select a site limit to generate on and type what to generate?",
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
            trigger: ({ value }) => (value === "failed" ? "failed" : "scuccess"),
          },
          {
            id: "failed",
            message: "Ops! That failed. Did you remeber to select a site limit? Try again",
            trigger: "1",
          },
          {
            id: "missing-selection",
            message: "You forgot to select a site limit. Click one in the scene and try again!",
            trigger: "1",
          },
          {
            id: "scuccess",
            message: "Yay!",
            trigger: "1",
          },
        ]}
      />
    </div>
  );
}
