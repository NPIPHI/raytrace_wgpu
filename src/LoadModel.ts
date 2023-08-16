import { Triangle } from "./Triangle";

type Mesh = {
    vertices: number[],
    indices: number[],
    name: string,
    material_index: number;
}

type Model = {
    meshes: Mesh[];
}

export async function load_model(path: string): Promise<Triangle[]> {
    const data = await fetch(path);
    const json: Model = await data.json();

    
    const verts = [];
    const norms = [];
    const colors = [];
    const mat_ids = [];
    const uvs = [];
    const TRI_SIZE = 8;
    for(let m = 0; m < json.meshes.length; m++){
        const mesh = json.meshes[m];
        const color = m == 30 ? [2,2,2] : [0,0,0];
        // const color = m == 12 ? [100,64.7,0] : [0,0,0];
        for(let i = 0; i < mesh.indices.length; i++){
            let index = mesh.indices[i];
            verts.push([mesh.vertices[index*TRI_SIZE+0], mesh.vertices[index*TRI_SIZE+1], mesh.vertices[index*TRI_SIZE+2]]);
            norms.push([mesh.vertices[index*TRI_SIZE+3], mesh.vertices[index*TRI_SIZE+4], mesh.vertices[index*TRI_SIZE+5]]);
            colors.push(color);
            mat_ids.push(mesh.material_index);
            uvs.push([mesh.vertices[index*TRI_SIZE+6], mesh.vertices[index*TRI_SIZE+7]]);
        }
    }
    

    const tris = [];
    for(let i = 0; i < verts.length; i+=3){
        tris.push(new Triangle(verts[i], verts[i+1], verts[i+2], norms[i], norms[i+1], norms[i+2], colors[i], uvs[i], uvs[i+1], uvs[i+2], mat_ids[i]));
    }

    console.log(tris.length, "Triangles")
    return tris;
}