"""
CameraExtraConfigNode - 相机额外提示词配置节点
输出 JSON 字符串，接入 CameraAngleNode 的 extra_config 可选输入
"""

import json


class CameraExtraConfigNode:
    """额外相机提示词配置节点（镜头/景深/运镜/构图/风格），输出 JSON 接入主相机节点"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lens_enabled": ("BOOLEAN", {
                    "default": False,
                    "label": "启用镜头",
                }),
                "lens_value": ("STRING", {
                    "default": "85mm lens",
                    "multiline": False,
                    "label": "镜头/焦距",
                }),
                "dof_enabled": ("BOOLEAN", {
                    "default": False,
                    "label": "启用景深",
                }),
                "dof_value": ("STRING", {
                    "default": "shallow depth of field",
                    "multiline": False,
                    "label": "景深文案",
                }),
                "dof_weight": ("FLOAT", {
                    "default": 1.3, "min": 0.1, "max": 10.0, "step": 0.1,
                    "label": "景深权重",
                }),
                "movement_enabled": ("BOOLEAN", {
                    "default": False,
                    "label": "启用运镜",
                }),
                "movement_value": ("STRING", {
                    "default": "handheld camera",
                    "multiline": False,
                    "label": "运镜文案",
                }),
                "composition_enabled": ("BOOLEAN", {
                    "default": False,
                    "label": "启用构图",
                }),
                "composition_value": ("STRING", {
                    "default": "rule of thirds",
                    "multiline": False,
                    "label": "构图文案",
                }),
                "style_enabled": ("BOOLEAN", {
                    "default": False,
                    "label": "启用风格",
                }),
                "style_value": ("STRING", {
                    "default": "cinematic",
                    "multiline": False,
                    "label": "风格文案",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("extra_config",)
    FUNCTION = "execute"
    CATEGORY = "Anima/相机"
    DESCRIPTION = "配置额外相机提示词（镜头/景深/运镜/构图/风格），输出 JSON 接至 Anima 相机控制节点"

    def execute(self,
                lens_enabled, lens_value,
                dof_enabled, dof_value, dof_weight,
                movement_enabled, movement_value,
                composition_enabled, composition_value,
                style_enabled, style_value):
        cfg = {
            "extras": {
                "lens":        {"enabled": lens_enabled, "value": lens_value},
                "dof":         {"enabled": dof_enabled, "value": dof_value, "weight": dof_weight},
                "movement":    {"enabled": movement_enabled, "value": movement_value},
                "composition": {"enabled": composition_enabled, "value": composition_value},
                "style":       {"enabled": style_enabled, "value": style_value},
            },
        }
        return (json.dumps(cfg, ensure_ascii=False),)


NODE_CLASS_MAPPINGS = {
    "CameraExtraConfigNode": CameraExtraConfigNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CameraExtraConfigNode": "Anima 相机额外提示词",
}
