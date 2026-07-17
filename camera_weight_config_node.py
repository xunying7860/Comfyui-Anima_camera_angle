"""
CameraWeightConfigNode - 相机权重/死区配置节点
输出 JSON 字符串，接入 CameraAngleNode 的 weight_config 可选输入
"""

import json


# 默认权重配置（与主节点一致）
DEFAULT_WEIGHTS = {
    "weight_min": 0.1,
    "weight_max": 10.0,
    "azimuth": {"weight": 10.0, "deadzone_ratio": 0.2},
    "elevation": {"extra": 10.0},
    "distance": {"extra": 0.0},
    "tilt": {"extra": 0.0, "deadzone": 0.15},
    "extra_master": 1.0,
}


class CameraWeightConfigNode:
    """相机权重/死区配置节点，输出 JSON 接入主相机节点"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "azimuth_weight": ("FLOAT", {
                    "default": 10.0, "min": 0.1, "max": 50.0, "step": 0.1,
                    "label": "方位权重（整体）",
                }),
                "weight_max": ("FLOAT", {
                    "default": 10.0, "min": 1.0, "max": 50.0, "step": 0.1,
                    "label": "权重最大值（钳制上限）",
                }),
                "extra_master": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 20.0, "step": 0.1,
                    "label": "额外权重总控",
                }),
                "elevation_extra": ("FLOAT", {
                    "default": 10.0, "min": -10.0, "max": 50.0, "step": 0.1,
                    "label": "高度额外权重",
                }),
                "distance_extra": ("FLOAT", {
                    "default": 0.0, "min": -10.0, "max": 50.0, "step": 0.1,
                    "label": "距离额外权重",
                }),
                "tilt_extra": ("FLOAT", {
                    "default": 0.0, "min": -10.0, "max": 50.0, "step": 0.1,
                    "label": "倾斜额外权重",
                }),
                "azimuth_deadzone": ("FLOAT", {
                    "default": 0.2, "min": 0.0, "max": 0.9, "step": 0.01,
                    "label": "方位死区比例",
                }),
                "tilt_deadzone": ("FLOAT", {
                    "default": 0.15, "min": 0.0, "max": 0.9, "step": 0.01,
                    "label": "倾斜死区",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("weight_config",)
    FUNCTION = "execute"
    CATEGORY = "Anima/相机"
    DESCRIPTION = "配置相机姿态权重和死区参数，输出 JSON 字符串接至 Anima 相机控制节点的可选输入"

    def execute(self, azimuth_weight, weight_max, extra_master,
                elevation_extra, distance_extra, tilt_extra,
                azimuth_deadzone, tilt_deadzone):
        cfg = {
            "weight_min": DEFAULT_WEIGHTS["weight_min"],
            "weight_max": weight_max,
            "azimuth": {
                "weight": azimuth_weight,
                "deadzone_ratio": azimuth_deadzone,
            },
            "elevation": {
                "extra": elevation_extra,
            },
            "distance": {
                "extra": distance_extra,
            },
            "tilt": {
                "extra": tilt_extra,
                "deadzone": tilt_deadzone,
            },
            "extra_master": extra_master,
        }
        return (json.dumps(cfg, ensure_ascii=False),)


NODE_CLASS_MAPPINGS = {
    "CameraWeightConfigNode": CameraWeightConfigNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CameraWeightConfigNode": "Anima 相机权重配置",
}
