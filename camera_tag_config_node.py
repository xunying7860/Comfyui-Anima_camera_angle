"""
CameraTagConfigNode - 相机方向/高度/距离/倾斜标签配置节点
输出 JSON 字符串，接入 CameraAngleNode 的 tag_config 可选输入
"""

import json


class CameraTagConfigNode:
    """自定义提示词标签配置节点，输出 JSON 接入主相机节点"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tag_front": ("STRING", {
                    "default": "from front",
                    "multiline": False,
                    "label": "前方 (Front)",
                }),
                "tag_back": ("STRING", {
                    "default": "from behind",
                    "multiline": False,
                    "label": "后方 (Back)",
                }),
                "tag_left": ("STRING", {
                    "default": "facing right",
                    "multiline": False,
                    "label": "左侧 (Left)",
                }),
                "tag_right": ("STRING", {
                    "default": "facing left",
                    "multiline": False,
                    "label": "右侧 (Right)",
                }),
                "tag_bird": ("STRING", {
                    "default": "bird's-eye view",
                    "multiline": False,
                    "label": "鸟瞰 (Bird)",
                }),
                "tag_high": ("STRING", {
                    "default": "high angle",
                    "multiline": False,
                    "label": "俯视 (High)",
                }),
                "tag_eye": ("STRING", {
                    "default": "eye-level",
                    "multiline": False,
                    "label": "平视 (Eye)",
                }),
                "tag_low": ("STRING", {
                    "default": "low angle",
                    "multiline": False,
                    "label": "仰视 (Low)",
                }),
                "tag_worm": ("STRING", {
                    "default": "worm's-eye view",
                    "multiline": False,
                    "label": "虫瞰 (Worm)",
                }),
                "tag_ecu": ("STRING", {
                    "default": "extreme close-up",
                    "multiline": False,
                    "label": "特写 (ECU)",
                }),
                "tag_cu": ("STRING", {
                    "default": "close-up",
                    "multiline": False,
                    "label": "近景 (CU)",
                }),
                "tag_medium": ("STRING", {
                    "default": "medium shot",
                    "multiline": False,
                    "label": "中景 (Medium)",
                }),
                "tag_full": ("STRING", {
                    "default": "full body",
                    "multiline": False,
                    "label": "全身 (Full)",
                }),
                "tag_wide": ("STRING", {
                    "default": "wide shot",
                    "multiline": False,
                    "label": "远景 (Wide)",
                }),
                "tag_dutch": ("STRING", {
                    "default": "dutch angle",
                    "multiline": False,
                    "label": "倾斜 (Dutch)",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("tag_config",)
    FUNCTION = "execute"
    CATEGORY = "Anima/相机"
    DESCRIPTION = "自定义相机各方向/高度/距离/倾斜的提示词标签，输出 JSON 接至 Anima 相机控制节点"

    def execute(self, tag_front, tag_back, tag_left, tag_right,
                tag_bird, tag_high, tag_eye, tag_low, tag_worm,
                tag_ecu, tag_cu, tag_medium, tag_full, tag_wide,
                tag_dutch):
        cfg = {
            "azimuth": {
                "directions": {
                    "front": {"tag": tag_front},
                    "back":  {"tag": tag_back},
                    "left":  {"tag": tag_left},
                    "right": {"tag": tag_right},
                },
            },
            "elevation": {
                "categories": {
                    "bird": {"tag": tag_bird},
                    "high": {"tag": tag_high},
                    "eye":  {"tag": tag_eye},
                    "low":  {"tag": tag_low},
                    "worm": {"tag": tag_worm},
                },
            },
            "distance": {
                "categories": {
                    "ecu":    {"tag": tag_ecu},
                    "cu":     {"tag": tag_cu},
                    "medium": {"tag": tag_medium},
                    "full":   {"tag": tag_full},
                    "wide":   {"tag": tag_wide},
                },
            },
            "tilt": {
                "dutch_tag": tag_dutch,
            },
        }
        return (json.dumps(cfg, ensure_ascii=False),)


NODE_CLASS_MAPPINGS = {
    "CameraTagConfigNode": CameraTagConfigNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CameraTagConfigNode": "Anima 相机标签配置",
}
