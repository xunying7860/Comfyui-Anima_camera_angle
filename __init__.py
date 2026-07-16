# 注册 Anima 相机控制节点（标签/额外提示词配置节点已合并为可选输入）
from .camera_angle_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .camera_extra_config_node import NODE_CLASS_MAPPINGS as ECM, NODE_DISPLAY_NAME_MAPPINGS as EDN

NODE_CLASS_MAPPINGS.update(ECM)

NODE_DISPLAY_NAME_MAPPINGS.update(EDN)

# 手动注册 JS 目录
import os
import nodes
custom_node_dir = os.path.dirname(os.path.realpath(__file__))
js_dir = os.path.join(custom_node_dir, "js")
nodes.EXTENSION_WEB_DIRS["Comfyui-Anima_camera_angle"] = js_dir

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
