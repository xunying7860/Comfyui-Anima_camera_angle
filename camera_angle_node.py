"""
CameraAngleNode - 可视化相机提示词控制节点
"""
import json
import math

# 默认标签
DEFAULT_TAGS = {
    "azimuth": {
        "directions": {
            "front": {"tag": "from front"}, "back": {"tag": "from behind"},
            "left": {"tag": "facing right"}, "right": {"tag": "facing left"},
        },
        "enabled": True, "weight": 10.0, "extra": 0.0, "deadzone_ratio": 0.05,
    },
    "elevation": {
        "categories": {
            "high": {"tag": "high angle"},
            "eye": {"tag": "eye-level"},
            "low": {"tag": "low angle"},
        },
        "enabled": True, "extra": 0.0,
    },
    "distance": {
        "categories": {
            "ecu": {"tag": "extreme close-up"}, "cu": {"tag": "close-up"},
            "medium": {"tag": "medium shot"}, "cowboy_shot": {"tag": "cowboy shot"},
            "full": {"tag": "full body"}, "wide": {"tag": "wide shot"},
        },
        "enabled": True, "extra": 0.0,
    },
    "tilt": {
        "dutch_tag": "dutch angle",
        "enabled": True, "extra": 0.0, "deadzone": 0.15,
    },
    "extra_master": 1.0,
    "weight_max": 10.0,
    "weight_min": 0.1,
    "xy_mult_enabled": True, "xy_mult": 10.0,
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
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "pos_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.05}),
                "pos_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "pos_z": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.05}),
                "roll": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.10}),
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
        return [t.strip() for t in str(tag).split(",") if t.strip()]

    @classmethod
    def _emit_weighted(cls, tag, w):
        return [f"({t}:{cls._fmt_weight(w)})" for t in cls._split_tags(tag)]

    @staticmethod
    def _elevation_key(y):
        if y > 0.2: return "high"
        if y >= -0.2: return "eye"
        return "low"

    @staticmethod
    def _distance_key(z):
        if z > 0.7: return "ecu"
        if z > 0.2: return "cu"
        if z > 0.0: return "medium"
        if z > -0.35: return "cowboy_shot"
        if z >= -0.7: return "full"
        return "wide"

    def execute(self, pos_x, pos_y, pos_z, roll,
                _tags_json="{}", extra_config=""):
        pos_x = max(-1.0, min(1.0, float(pos_x)))
        pos_y = max(-1.0, min(1.0, float(pos_y)))
        pos_z = max(-1.0, min(1.0, float(pos_z)))
        roll = max(0.0, min(1.0, float(roll)))

        # 加载配置（标签 + 权重参数）
        tags = {}
        _deep_merge(tags, DEFAULT_TAGS)
        if _tags_json and _tags_json != "{}":
            try:
                td = json.loads(_tags_json)
                if isinstance(td, dict): _deep_merge(tags, td)
            except Exception: pass

        # 读取配置值（带安全兜底）
        wmin = float(tags.get("weight_min", 0.1))
        wmax = float(tags.get("weight_max", 10.0))
        em = float(tags.get("extra_master", 1.0))
        xy_mult_enabled = tags.get("xy_mult_enabled", False)
        xy_mult = float(tags.get("xy_mult", 10.0))
        az_weight = float(tags.get("azimuth", {}).get("weight", 10.0))
        az_extra = float(tags.get("azimuth", {}).get("extra", 0.0))
        az_dz = float(tags.get("azimuth", {}).get("deadzone_ratio", 0.05))
        el_extra = float(tags.get("elevation", {}).get("extra", 10.0))
        di_extra = float(tags.get("distance", {}).get("extra", 0.0))
        ti_extra = float(tags.get("tilt", {}).get("extra", 0.0))
        ti_dz = float(tags.get("tilt", {}).get("deadzone", 0.15))

        # 加载额外提示词
        extras = {}
        _deep_merge(extras, DEFAULT_EXTRAS)
        if extra_config:
            try:
                ec = json.loads(extra_config)
                if "extras" in ec: extras.update(ec["extras"])
            except Exception: pass

        parts = []

        # ---------- 方位 ----------
        az_tag = tags.get("azimuth", {})
        if az_tag.get("enabled", True):
            az = float(pos_x) * math.pi
            front = max(0.0, math.cos(az))
            back = max(0.0, -math.cos(az))
            right = max(0.0, math.sin(az))
            left = max(0.0, -math.sin(az))
            s = front + back + left + right
            if s > 0:
                front /= s; back /= s; left /= s; right /= s
            AZ_POLE = 0.9
            az_gate = max(0.0, min(1.0, (1.0 - abs(pos_y)) / (1.0 - AZ_POLE)))
            az_budget = (az_weight + az_extra * em) * az_gate
            cur_max = wmax
            if xy_mult_enabled:
                az_budget = (xy_mult + az_extra * em) * az_gate
                cur_max = max(wmax, xy_mult)
            for name, ratio in (("front", front), ("back", back), ("left", left), ("right", right)):
                w = ratio * az_budget
                if ratio <= 0 or w < az_dz: continue
                w = min(cur_max + max(0.0, az_extra * em), max(wmin, w))
                parts.extend(self._emit_weighted(az_tag["directions"][name]["tag"], w))

        # ---------- 高度（3 档） ----------
        el_tag = tags.get("elevation", {})
        if el_tag.get("enabled", True):
            elev_key = self._elevation_key(pos_y)
            elev_cat = el_tag.get("categories", {}).get(elev_key)
            if elev_cat and elev_cat.get("tag"):
                el_base_mult = 15.0 if elev_key == "eye" else 10.0
                if xy_mult_enabled:
                    el_base_mult = xy_mult
                ew = abs(pos_y) * el_base_mult + em * el_extra
                if ew >= az_dz:
                    cap = (max(wmax, xy_mult) if xy_mult_enabled else wmax) + max(0.0, el_extra * em)
                    ew = min(cap, max(wmin, ew))
                    parts.extend(self._emit_weighted(elev_cat["tag"], ew))

        # ---------- 距离 ----------
        di_tag = tags.get("distance", {})
        if di_tag.get("enabled", True):
            dist_key = self._distance_key(pos_z)
            dist_cat = di_tag.get("categories", {}).get(dist_key)
            if dist_cat and dist_cat.get("tag"):
                dw = 1.0 + em * di_extra
                parts.extend(self._emit_weighted(dist_cat["tag"], min(wmax + max(0.0, di_extra * em), max(0.1, dw))))

        # ---------- 倾斜 ----------
        ti_tag = tags.get("tilt", {})
        if ti_tag.get("enabled", True) and float(roll) > 0:
            tw = 1.0 + em * ti_extra
            parts.extend(self._emit_weighted(ti_tag.get("dutch_tag", ""), min(wmax + max(0.0, ti_extra * em), max(0.1, tw))))

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
        # 从 extra_config 解析 extreme 标签（直通，无 pos_y 限制）
        if extra_config:
            try:
                ec = json.loads(extra_config)
                if "extreme_high" in ec:
                    eh = ec["extreme_high"]
                    if isinstance(eh, dict) and eh.get("tag", "").strip():
                        parts.extend(self._emit_weighted(eh["tag"], float(eh.get("weight", 10.0))))
                if "extreme_low" in ec:
                    el = ec["extreme_low"]
                    if isinstance(el, dict) and el.get("tag", "").strip():
                        parts.extend(self._emit_weighted(el["tag"], float(el.get("weight", 10.0))))
            except Exception: pass

        return (", ".join(parts),)


NODE_CLASS_MAPPINGS = {"CameraAngleNode": CameraAngleNode}
NODE_DISPLAY_NAME_MAPPINGS = {"CameraAngleNode": "Anima 相机控制"}
