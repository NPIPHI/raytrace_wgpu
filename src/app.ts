import { mat4 } from "gl-matrix";
import { Camera } from "./Camera";
import { ComputePipeline, RenderPipeline, Vertexformats } from "./RenderPass";
import basic_shader_source from "./shaders/forward.wgsl";
import raytrace_shader_source from "./shaders/raytrace.wgsl";
import raytrace_blit_shader_source from "./shaders/raytrace_blit.wgsl";
import debug_bvh_shader_source from "./shaders/bvh_debug.wgsl";
import { Triangle } from "./Triangle";
import { BVH } from "./BVH";

const FLOAT_SIZE = 4;

export class App {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private ctx: GPUCanvasContext;
    private render_pipeline: RenderPipeline;
    private blit_pipeline: RenderPipeline;
    private raytrace_pipeline: ComputePipeline;
    private debug_bvh_pipeline: RenderPipeline;

    private render_bind: GPUBindGroup;
    private blit_bind: GPUBindGroup;
    private raytrace_bind: GPUBindGroup;
    private debug_bvh_bind: GPUBindGroup;

    private fullscreen_tri: GPUBuffer
    private vertex_data: GPUBuffer;
    private settings_buffer: GPUBuffer;
    private depth_tex: GPUTexture;
    private frame_buffer: GPUBuffer;
    private bvh_tree_buffer: GPUBuffer;
    private bvh_triangles_buffer: GPUBuffer;
    private debug_bvh_buffer: GPUBuffer;

    private triangle_count: number;
    private frame_count = 0;
    private sample_count = 1;
    private camera_dirty = true;
    private raytrace_dispatch_dim = 8;
    private last_cam: mat4 = mat4.create();

    private width: number;
    private height: number;

    constructor(canvas: HTMLCanvasElement, device: GPUDevice){
        this.device = device;
        this.canvas = canvas;
        this.width = this.canvas.width = this.canvas.clientWidth;
        this.height = this.canvas.height = this.canvas.clientHeight;
        console.log(this.width, this.height);
        this.ctx = canvas.getContext("webgpu");
        const canvas_format = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({
            device: this.device,
            format: canvas_format,
            alphaMode: "premultiplied"
        })

        this.render_pipeline = new RenderPipeline(this.device, basic_shader_source, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DNORM,
            cullMode: "none"
        }, "main render");

        this.blit_pipeline = new RenderPipeline(this.device, raytrace_blit_shader_source, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V2DUV
        }, "blit render");

        this.debug_bvh_pipeline = new RenderPipeline(this.device, debug_bvh_shader_source, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DNORM,
            cullMode: "none",
        }, "debug bvh render");

        this.raytrace_pipeline = new ComputePipeline(this.device, raytrace_shader_source, {
            constants: {wg_dim: this.raytrace_dispatch_dim}
        }, "raytrace shader");

        this.make_buffers();
        this.set_triangles([Triangle.default()]);
        this.make_bindgroups();
    }

    private make_bindgroups() {
        this.render_bind = this.device.createBindGroup({
            layout: this.render_pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.settings_buffer
                    }
                }
            ],
            label: "render bind"
        });

        this.debug_bvh_bind = this.device.createBindGroup({
            layout: this.debug_bvh_pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.settings_buffer
                    }
                }
            ],
            label: "render bind"
        });

        this.blit_bind = this.device.createBindGroup({
            layout: this.blit_pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.frame_buffer
                    }
                }
            ],
            label: "blit bind"
        });

        this.raytrace_bind = this.device.createBindGroup({
            layout: this.raytrace_pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.settings_buffer
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.frame_buffer
                    }
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.bvh_tree_buffer 
                    }
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.bvh_triangles_buffer
                    }
                }
            ],
            label: "raytrace bind"
        })
    }

    public set_triangles(tris: Triangle[]){
        this.triangle_count = tris.length;
        this.camera_dirty = true;

        this.vertex_data = this.device.createBuffer({
            size: Triangle.vertex_size() * tris.length * FLOAT_SIZE,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
            label: "vertex data"
        });

        const raster_data = new Float32Array(Triangle.vertex_size() * tris.length);
        for(let i = 0; i < tris.length; i++){
            tris[i].write_vertex(raster_data, i * Triangle.vertex_size());
        }

        this.device.queue.writeBuffer(this.vertex_data, 0, raster_data);


        const bvh = new BVH(tris);
        const ser = bvh.serialize();
        const dbg = bvh.serialize_debug();

        this.bvh_tree_buffer = this.device.createBuffer({
            size: ser.tree.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });

        this.bvh_triangles_buffer = this.device.createBuffer({
            size: ser.tris.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        })

        this.debug_bvh_buffer = this.device.createBuffer({
            size: dbg.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
        })

        this.device.queue.writeBuffer(this.bvh_tree_buffer, 0, ser.tree);
        this.device.queue.writeBuffer(this.bvh_triangles_buffer, 0, ser.tris);
        this.device.queue.writeBuffer(this.debug_bvh_buffer, 0, dbg);

        this.make_bindgroups();
    }

    private make_buffers(){
        this.settings_buffer= this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
            label: "camera buffer"
        })

        this.depth_tex = this.device.createTexture({
            size: [this.width, this.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            format: "depth32float",
            label: "depth texture"
        })

        this.fullscreen_tri = this.device.createBuffer({
            size: 16 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
            label: "fullscreen tri buffer",
        })

        this.frame_buffer = this.device.createBuffer({
            size: 16 + this.width * this.height * 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: "frame buffer"
        })

        const fullscreen_data = new Float32Array([
            -1,-1,  0,0,
            -1,3,   0,2,
            3,-1,   2,0
        ])

        this.device.queue.writeBuffer(this.fullscreen_tri, 0, fullscreen_data);
        this.device.queue.writeBuffer(this.frame_buffer, 0, new Uint32Array([this.width, this.height]));
    }

    set_camera(camera: Camera) {
        const mvp = mat4.create();
        const perspective = mat4.create();
        mat4.perspective(perspective, Math.PI/2, this.width/this.height, 0.1, Infinity);
        mat4.multiply(mvp, perspective, camera.view());

        if(mat4.equals(mvp, this.last_cam)){
            return;
        }
        this.last_cam = mvp;

        const data = new Float32Array([...mvp,...camera.get_pos(),this.width/this.height]);        

        this.device.queue.writeBuffer(this.settings_buffer, 0, data);
        this.camera_dirty = true;
    }

    draw() {
        this.device.queue.writeBuffer(this.settings_buffer, 80, new Uint32Array([this.frame_count, this.camera_dirty?1:0,this.sample_count]));
        this.frame_count++;
        this.camera_dirty = false;
        // const scissor_point = this.width/2|0;
        // const scissor_point = this.width;
        const scissor_point = 0;

        const encoder = this.device.createCommandEncoder();

        const pass1 = encoder.beginComputePass();
        
        pass1.setPipeline(this.raytrace_pipeline.getPipeline());
        
        pass1.setBindGroup(0, this.raytrace_bind);

        pass1.dispatchWorkgroups(Math.ceil(this.width/this.raytrace_dispatch_dim), Math.ceil(this.height/this.raytrace_dispatch_dim));

        pass1.end();

        const pass2 = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.ctx.getCurrentTexture().createView(),
                    clearValue: [0.1,0.1,0.1,1],
                    loadOp: "clear",
                    storeOp: "store",
                }
            ],

            depthStencilAttachment: {
                view: this.depth_tex.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard"
            }
        });

        // pass2.setScissorRect(0, 0, scissor_point, this.height);
        // pass2.setBindGroup(0, this.render_bind);
        // pass2.setVertexBuffer(0, this.vertex_data);
        // pass2.setPipeline(this.render_pipeline.getPipeline());
        // pass2.draw(this.triangle_count * 3);

        // pass2.setBindGroup(0, this.debug_bvh_bind);
        // pass2.setPipeline(this.debug_bvh_pipeline.getPipeline());
        // pass2.setVertexBuffer(0, this.debug_bvh_buffer);
        // pass2.draw(this.debug_bvh_buffer.size / 24);


        pass2.setBindGroup(0, this.blit_bind);
        pass2.setVertexBuffer(0, this.fullscreen_tri);
        pass2.setPipeline(this.blit_pipeline.getPipeline());
        pass2.setScissorRect(scissor_point, 0, this.width - scissor_point, this.height);
        pass2.draw(3);

        pass2.end();

        this.device.queue.submit([encoder.finish()]);
    }
}