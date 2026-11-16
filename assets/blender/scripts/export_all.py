"""Export the Deltoid scenes to glTF binary and save .blend sources.

    import export_all
    export_all.run(r"<repo>/assets/blender", r"<repo>/assets/blender/export")

Each scene is written as an uncompressed .glb (Y up, transforms applied,
metres). Compression (meshopt) is a separate step: see tools/compress-models.mjs.
Only objects this project created are written; nothing else in the open
Blender session is touched or saved.
"""

import contextlib
import io
import json
import os
import struct

import bpy

import deltoid_lib as L

# file name -> (scene, predicate on object name)
FILES = {
    "adult": ("Deltoid_Adult", lambda n: n.startswith("Adult_") and "_Bone_" not in n
              and "_Muscle_" not in n and "_Nerve_" not in n),
    "adult_anatomy": ("Deltoid_Adult", lambda n: n.startswith(("Adult_Bone_", "Adult_Muscle_", "Adult_Nerve_"))),
    "infant": ("Deltoid_Infant", lambda n: n.startswith("Infant_") and "_Bone_" not in n
               and "_Muscle_" not in n and "_Nerve_" not in n),
    "infant_anatomy": ("Deltoid_Infant", lambda n: n.startswith(("Infant_Bone_", "Infant_Muscle_", "Infant_Nerve_"))),
    "tissue": ("Deltoid_Tissue", lambda n: n.startswith("Tissue_")),
    "syringe": ("Deltoid_Syringe", lambda n: n.startswith("Syringe_")),
}

BLENDS = {
    "deltoid_adult.blend": "Deltoid_Adult",
    "deltoid_infant.blend": "Deltoid_Infant",
    "deltoid_tissue.blend": "Deltoid_Tissue",
    "deltoid_syringe.blend": "Deltoid_Syringe",
}


def _gltf_options():
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    want = dict(
        export_format="GLB", use_selection=True, use_active_scene=True, export_yup=True, export_apply=True,
        export_texcoords=False, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_extras=False, export_animations=False, export_skins=False, export_morph=False,
        export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_draco_mesh_compression_enable=False,
    )
    return {k: v for k, v in want.items() if k in props}


def _node_names(path):
    with open(path, "rb") as fh:
        fh.seek(12)
        length, _kind = struct.unpack("<II", fh.read(8))
        doc = json.loads(fh.read(length).decode("utf-8"))
    return [n.get("name", "") for n in doc.get("nodes", [])]


def run(blend_dir, glb_dir):
    os.makedirs(blend_dir, exist_ok=True)
    os.makedirs(glb_dir, exist_ok=True)
    opts = _gltf_options()
    report = {"options": sorted(opts.keys()), "glb": {}, "blend": {}}
    for name, (scene_name, keep) in FILES.items():
        sc = L.activate(bpy.data.scenes[scene_name])
        bpy.context.view_layer.update()
        picked = 0
        for ob in bpy.context.view_layer.objects:
            if ob is None:
                continue
            sel = keep(ob.name)
            ob.select_set(sel)
            picked += 1 if sel else 0
            if sel and ob.type == "MESH":
                ob.data.validate()
        path = os.path.join(glb_dir, name + ".glb")
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.export_scene.gltf(filepath=path, **opts)
        nodes = _node_names(path)
        stray = [n for n in nodes if not keep(n)]
        report["glb"][name] = {"selected": picked, "nodes": len(nodes), "stray": stray[:8],
                               "bytes": os.path.getsize(path)}
    for fname, scene_name in BLENDS.items():
        path = os.path.join(blend_dir, fname)
        bpy.data.libraries.write(path, {bpy.data.scenes[scene_name]}, fake_user=True, compress=True)
        report["blend"][fname] = os.path.getsize(path)
    return report
