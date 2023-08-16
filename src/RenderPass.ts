export const Vertexformats: {[key: string]: GPUVertexBufferLayout[]} = {
    V2DSimple: [
        {
            attributes: [
                {
                    shaderLocation: 0, //position
                    offset: 0,
                    format: "float32x2",
                }
            ],
            arrayStride: 8,
            stepMode: "vertex"
        }
    ],
    V2DUV: [
        {
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x2",
                },
                {
                    shaderLocation: 1,
                    offset: 8,
                    format: "float32x2",
                }
            ],
            arrayStride: 16,
            stepMode: "vertex"
        }
    ],
    V3DNORM: [
        {
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x3",
                },
                {
                    shaderLocation: 1,
                    offset: 12,
                    format: "float32x3",
                }
            ],
            arrayStride: 24,
            stepMode: "vertex"
        }
    ],
    V3DUV: [
        {
            attributes: [
                {
                    shaderLocation: 0, //position
                    offset: 0,
                    format: "float32x3",
                },
                {
                    shaderLocation: 1, // uv
                    offset: 12,
                    format:"float32x2"
                }
            ],
            arrayStride: 20,
            stepMode: "vertex"
        }
    ],
    Empty: [

    ]
} 

export type RenderPassParams = {
    cullMode?: GPUCullMode;
    targets: GPUColorTargetState[],
    vertex_layout: GPUVertexBufferLayout[],
    depthWrite?: boolean,
    depthCompare?: GPUCompareFunction,
    topology?: GPUPrimitiveTopology,
    vertex_constants?: Record<string,number>
    fragment_constants?: Record<string,number>
}

export type ComputePassParams = {
    constants?: Record<string,number>
}

export class RenderPipeline {
    private device: GPUDevice;
    private shader: GPUShaderModule;
    private pipeline: GPURenderPipeline;
    private bind_group_layout_cache: GPUBindGroupLayout[] = [];
    constructor(device: GPUDevice, src: string, params: RenderPassParams, label: string = "graphics shader"){
        this.device = device;
        this.shader = device.createShaderModule({code: src, label});
        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: this.shader,
                entryPoint: "vertex_main",
                buffers: params.vertex_layout,
                constants: params.vertex_constants,
            },
            fragment: {
                module: this.shader,
                entryPoint: "fragment_main",
                targets: params.targets,
                constants: params.fragment_constants,
            },
            primitive: {
                topology: params.topology || "triangle-list",
                cullMode: params.cullMode || "none",
            },
            depthStencil: {
                format: "depth32float",
                depthWriteEnabled: params.depthWrite || true,
                depthCompare: params.depthCompare || "less",
            },
            label: label + " pipeline",
        });
    }

    getBindGroup(index: number): GPUBindGroupLayout {
        if(!this.bind_group_layout_cache[index]){
            this.bind_group_layout_cache[index] = this.pipeline.getBindGroupLayout(index);
        }
        return this.bind_group_layout_cache[index];
    }

    getPipeline(){
        return this.pipeline;
    }
}

export class ComputePipeline {
    private device: GPUDevice;
    private shader: GPUShaderModule;
    private pipeline: GPUComputePipeline;
    private bind_group_layout_cache: GPUBindGroupLayout[] = [];
    constructor(device: GPUDevice, src: string, params: ComputePassParams, label: string = "compute shader"){
        this.device = device;
        this.shader = this.device.createShaderModule({code: src, label});
        this.pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.shader,
                entryPoint: "main",
                constants: params.constants,
            },
            label: label + " pipeline"
        });
    }

    getBindGroup(index: number): GPUBindGroupLayout {
        if(!this.bind_group_layout_cache[index]){
            this.bind_group_layout_cache[index] = this.pipeline.getBindGroupLayout(index);
        }
        return this.bind_group_layout_cache[index];
    }

    getPipeline(){
        return this.pipeline;
    }
}