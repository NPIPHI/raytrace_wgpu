import { App } from "./app"
import { Camera } from "./Camera";
import { load_model } from "./LoadModel";
import { Triangle } from "./Triangle";

async function main(){
    const canvas = <HTMLCanvasElement>document.getElementById("canvas");
    const gpu = navigator.gpu;
    if(!gpu){
        throw new Error("WebGPU not supported");
    }


    const adapter = await gpu.requestAdapter({powerPreference: "high-performance"});
    const device = await adapter.requestDevice({label: "GPU Device"});


    const app = new App(canvas, device);
    const camera = new Camera();

    let last_time = 0;
    let frame_ct = 0;
    let last_fps_poll = 0;
    const run = (time: number)=>{
        requestAnimationFrame(run);
        let dt = (time - last_time) / 1000;
        last_time = time;

        frame_ct++;
        if(frame_ct % 10 == 0) {
            console.log("fps", 1000* frame_ct / (time - last_fps_poll), "mspf", (time - last_fps_poll) / frame_ct)
            last_fps_poll = time;
            frame_ct = 0;
        }

        if(dt > 1) dt = 1;

        camera.update(dt)
        app.set_camera(camera)
        app.draw();
    }
    requestAnimationFrame(run);

    load_model("./verts.json").then(tris=>app.set_triangles(tris));
}

window.onload = main;