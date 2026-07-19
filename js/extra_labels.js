// Anima 相机额外提示词 - 中文化修正
// 修正 ComfyUI 对前两个参数 label 不生效的问题
import { app } from "../../scripts/app.js";

const NODE_TYPE = "CameraExtraConfigNode";

app.registerExtension({
    name: "AnimaCamera.ExtraLabels",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);
            // 修正标签显示
            const labels = { extreme_type: "极限角度", extreme_weight: "极限权重" };
            for (const w of this.widgets || []) {
                if (labels[w.name]) w.label = labels[w.name];
            }
            return r;
        };
    },
});
