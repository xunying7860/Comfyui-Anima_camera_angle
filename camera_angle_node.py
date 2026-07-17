"""
CameraAngleNode - 可视化相机提示词控制节点（极向门控版）

权重/死区参数固定为合理默认值，不再由外部面板控制。
标签固定使用默认值，不再支持外部 tag_config 覆盖。
额外提示词仍可接入可选配置节点。
"""

import json
import math

# 默认标签
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

# 默认额外提示词
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
    """可视化相机提示词控制节点（极向门控版）"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "pos_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.20}),
                "pos_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.20}),
                "pos_z": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.20}),
                "roll": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.20}),
                # 标签 JSON（required STRING 确保序列化，前端极小化隐藏）
                "_tags_json": ("STRING", {"multiline": False, "default": "{}"}),
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
    def _split_tags(tag):
        """逗号分隔的多标签拆分为列表。"""
        return [t.strip() for t in str(tag).split(",") if t.strip()]

    @classmethod
    def _emit_weighted(cls, tag, w):
        """多标签共享同一权重输出。"""
        return [f"({t}:{cls._fmt_weight(w)})" for t in cls._split_tags(tag)]

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
                _tags_json="{}", extra_config=""):

        # 钳制输入值到合法范围
        pos_x = max(-1.0, min(1.0, float(pos_x)))
        pos_y = max(-1.0, min(1.0, float(pos_y)))
        pos_z = max(-1.0, min(1.0, float(pos_z)))
        roll = max(0.0, min(1.0, float(roll)))

        # 固定权重参数
        w_az = 10.0; w_max = 10.0; w_ma = 1.0; w_el = 10.0
        w_di = 0.0; w_az_dz = 0.2

        # 加载标签（默认值 + _tags_json 覆盖）
        tags = {}
        _deep_merge(tags, DEFAULT_TAGS)
        if _tags_json and _tags_json != "{}":
            try:
                td = json.loads(_tags_json)
                if isinstance(td, dict): _deep_merge(tags, td)
            except Exception: pass

        # 加载额外提示词（从 extra_config）
        extras = {}
        _deep_merge(extras, DEFAULT_EXTRAS)
        if extra_config:
            try:
                ec = json.loads(extra_config)
                if "extras" in ec: extras.update(ec["extras"])
            except Exception: pass

        wmin = 0.1; wmax = w_max; dz = w_az_dz
        parts = []

        # ---------- 方位（极向门控） ----------
        az = float(pos_x) * math.pi
        front = max(0.0, math.cos(az))
        back = max(0.0, -math.cos(az))
        right = max(0.0, math.sin(az))
        left = max(0.0, -math.sin(az))
        s = front + back + left + right
        if s > 0:
            front /= s; back /= s; left /= s; right /= s
        # 极向门控：|pos_y|>0.9 时才削减方位预算
        AZ_POLE = 0.9
        az_gate = max(0.0, min(1.0, (1.0 - abs(pos_y)) / (1.0 - AZ_POLE)))
        az_budget = w_az * az_gate
        for name, ratio in (("front", front), ("back", back), ("left", left), ("right", right)):
            w = ratio * az_budget
            if ratio <= 0 or w < dz: continue
            w = min(wmax, max(wmin, w))
            parts.extend(self._emit_weighted(tags["azimuth"]["directions"][name]["tag"], w))

        # ---------- 高度 ----------
        elev_key = self._elevation_key(pos_y)
        elev_cat = tags["elevation"]["categories"].get(elev_key)
        if elev_cat and elev_cat.get("tag"):
            ew = abs(pos_y) * (1.0 + w_ma * w_el)
            if ew >= dz:
                ew = min(wmax, max(wmin, ew))
                parts.extend(self._emit_weighted(elev_cat["tag"], ew))

        # ---------- 距离 ----------
        dist_key = self._distance_key(pos_z)
        dist_cat = tags["distance"]["categories"].get(dist_key)
        if dist_cat and dist_cat.get("tag"):
            dw = 1.0 + w_ma * w_di
            parts.extend(self._emit_weighted(dist_cat["tag"], min(wmax, max(0.1, dw))))

        # ---------- 倾斜 ----------
        if float(roll) > 0:
            parts.extend(self._emit_weighted(tags["tilt"]["dutch_tag"], float(roll) * 10.0))

        # ---------- 额外提示词 ----------
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
