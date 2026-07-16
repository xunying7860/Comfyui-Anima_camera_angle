"""
CameraAngleNode - 可视化相机提示词控制节点（权重内置版）

权重/死区参数完全内置在主节点内部，不出现在外部。
通过 3D 场景内的配置面板调整。
标签和额外提示词仍可接入可选配置节点。
"""

import json
import math

# 默认参数
DEFAULT_WEIGHTS = {
    "azimuth_weight": 10.0, "weight_max": 10.0, "extra_master": 1.0,
    "elevation_extra": 10.0, "distance_extra": 0.0, "tilt_extra": 0.0,
    "azimuth_deadzone": 0.20, "tilt_deadzone": 0.15,
}

DEFAULT_TAGS = {
    "azimuth": {"directions": {
        "front": {"tag": "from front"}, "back": {"tag": "from behind"},
        "left": {"tag": "facing right"}, "right": {"tag": "facing left"},
    }},
    "elevation": {"categories": {
        "bird": {"tag": "bird's-eye view"}, "high": {"tag": "high angle"},
        "eye": {"tag": "eye-level"}, "low": {"tag": "low angle"},
        "worm": {"tag": "worm's-eye view"},
    }},
    "distance": {"categories": {
        "ecu": {"tag": "extreme close-up"}, "cu": {"tag": "close-up"},
        "medium": {"tag": "medium shot"}, "full": {"tag": "full body"},
        "wide": {"tag": "wide shot"},
    }},
    "tilt": {"dutch_tag": "dutch angle"},
}

DEFAULT_EXTRAS = {
    "lens": {"enabled": False, "value": "85mm lens"},
    "dof": {"enabled": False, "value": "shallow depth of field", "weight": 1.3},
    "movement": {"enabled": False, "value": "handheld camera"},
    "composition": {"enabled": False, "value": "rule of thirds"},
    "style": {"enabled": False, "value": "cinematic"},
}


def _deep_merge(base, override):
    for k, v in override.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
    return base


class CameraAngleNode:
    """可视化相机提示词控制节点（权重完全内置）"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "pos_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "pos_y": ("FLOAT", {"default": 0.0, "min": -1.34, "max": 1.34, "step": 0.01}),
                "pos_z": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "roll": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            },
            "optional": {
                "extra_config": ("*", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("相机提示词",)
    FUNCTION = "execute"
    CATEGORY = "Anima/相机"

    @staticmethod
    def _fmt_weight(w):
        return f"{round(float(w), 2):.2f}"

    @staticmethod
    def _elevation_key(y):
        if y > 0.7: return "bird"
        if y > 0.2: return "high"
        if y >= -0.2: return "eye"
        if y >= -0.7: return "low"
        return "worm"

    @staticmethod
    def _distance_key(z):
        if z > 0.7: return "ecu"
        if z > 0.2: return "cu"
        if z >= -0.2: return "medium"
        if z >= -0.7: return "full"
        return "wide"

    def execute(self, pos_x, pos_y, pos_z, roll,
                extra_config=""):
        # 钳制输入值到合法范围（兼容老工作流超限值）
        pos_x = max(-1.0, min(1.0, float(pos_x)))
        pos_y = max(-1.34, min(1.34, float(pos_y)))
        pos_z = max(-1.0, min(1.0, float(pos_z)))
        roll = max(0.0, min(1.0, float(roll)))

        # 固定权重参数（不再由前端面板控制，保持合理的默认值）
        w_az = 10.0; w_max = 10.0; w_ma = 1.0; w_el = 10.0
        w_di = 0.0; w_az_dz = 0.2
        # 标签固定使用默认值（不再支持外部 tag_config 覆盖）
        tags = {}
        _deep_merge(tags, DEFAULT_TAGS)

        extras = {}
        _deep_merge(extras, DEFAULT_EXTRAS)
        if extra_config:
            try:
                ec = json.loads(extra_config)
                if "extras" in ec: extras.update(ec["extras"])
            except Exception: pass

        parts = []
        wmax = w_max
        az = float(pos_x) * math.pi
        front = max(0.0, math.cos(az))
        back = max(0.0, -math.cos(az))
        right = max(0.0, math.sin(az))
        left = max(0.0, -math.sin(az))
        s = front + back + left + right
        if s > 0:
            front /= s; back /= s; left /= s; right /= s

        az_budget = (1.0 - abs(float(pos_y))) * w_az
        dz_r = w_az_dz
        for name, ratio in (("front", front), ("back", back), ("left", left), ("right", right)):
            w = ratio * az_budget
            if ratio <= 0 or w < dz_r: continue
            w = min(wmax, max(0.1, w))
            parts.append(f"({tags['azimuth']['directions'][name]['tag']}:{self._fmt_weight(w)})")

        elev_key = self._elevation_key(float(pos_y))
        elev_cat = tags["elevation"]["categories"].get(elev_key)
        if elev_cat and elev_cat.get("tag"):
            ew = abs(float(pos_y)) * (1.0 + w_ma * w_el)
            if ew >= dz_r:
                ew = min(wmax, max(0.1, ew))
                parts.append(f"({elev_cat['tag']}:{self._fmt_weight(ew)})")

        dist_key = self._distance_key(float(pos_z))
        dist_cat = tags["distance"]["categories"].get(dist_key)
        if dist_cat and dist_cat.get("tag"):
            dw = 1.0 + w_ma * w_di
            parts.append(f"({dist_cat['tag']}:{self._fmt_weight(min(wmax, max(0.1, dw)))})")

        if float(roll) > 0:
            parts.append(f"({tags['tilt']['dutch_tag']}:{self._fmt_weight(float(roll) * 10.0)})")

        for key in ("lens", "dof", "movement", "composition", "style"):
            e = extras.get(key)
            if not e or not e.get("enabled"): continue
            val = (e.get("value") or "").strip()
            if not val: continue
            if key == "dof":
                parts.append(f"({val}:{self._fmt_weight(e.get('weight', 1.3))})")
            else:
                parts.append(val)

        return (", ".join(parts),)


NODE_CLASS_MAPPINGS = {"CameraAngleNode": CameraAngleNode}
NODE_DISPLAY_NAME_MAPPINGS = {"CameraAngleNode": "Anima 相机控制"}
