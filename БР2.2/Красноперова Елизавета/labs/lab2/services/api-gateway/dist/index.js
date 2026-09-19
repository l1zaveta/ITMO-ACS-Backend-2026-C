"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3000;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ||
    "http://localhost:3001";
const RECIPE_SERVICE_URL = process.env.RECIPE_SERVICE_URL ||
    "http://localhost:3002";
const SOCIAL_SERVICE_URL = process.env.SOCIAL_SERVICE_URL ||
    "http://localhost:3003";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN ||
    "internal-service-token";
async function callService(baseUrl, path, options = {}) {
    var _a;
    const response = await fetch(baseUrl + path, options);
    let data;
    try {
        data = await response.json();
    }
    catch (_b) {
        data = null;
    }
    if (!response.ok) {
        const error = new Error(((_a = data === null || data === void 0 ? void 0 : data.error) === null || _a === void 0 ? void 0 : _a.message) ||
            (data === null || data === void 0 ? void 0 : data.message) ||
            "Ошибка сервиса");
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return {
        status: response.status,
        data
    };
}
function getTarget(path) {
    if (/^\/api\/recipes\/\d+\/(like|save|comments)/.test(path)) {
        return SOCIAL_SERVICE_URL;
    }
    if (/^\/api\/users\/\d+\/subscribe/.test(path)) {
        return SOCIAL_SERVICE_URL;
    }
    if (path === "/api/users/me/subscriptions" ||
        path === "/api/users/me/subscribers" ||
        path === "/api/users/me/saved") {
        return SOCIAL_SERVICE_URL;
    }
    if (/^\/api\/comments/.test(path)) {
        return SOCIAL_SERVICE_URL;
    }
    if (path === "/api/recipes" ||
        path === "/api/recipes/mine" ||
        /^\/api\/recipes\/\d+/.test(path)) {
        return RECIPE_SERVICE_URL;
    }
    if (/^\/api\/auth/.test(path)) {
        return USER_SERVICE_URL;
    }
    if (path === "/api/users/me/recipes") {
        return RECIPE_SERVICE_URL;
    }
    if (/^\/api\/users/.test(path)) {
        return USER_SERVICE_URL;
    }
    return null;
}
async function getRecipes(req, res) {
    try {
        const recipeResponse = await callService(RECIPE_SERVICE_URL, req.originalUrl, {
            method: "GET"
        });
        const recipes = Array.isArray(recipeResponse.data)
            ? recipeResponse.data
            : [];
        const result = await Promise.all(recipes.map(async (recipe) => {
            var _a;
            let likesCount = 0;
            try {
                const summary = await callService(SOCIAL_SERVICE_URL, `/internal/recipes/${recipe.recipe_id}/summary`, {
                    method: "GET",
                    headers: {
                        "x-service-token": SERVICE_TOKEN
                    }
                });
                likesCount =
                    Number((_a = summary.data) === null || _a === void 0 ? void 0 : _a.likes_count) || 0;
            }
            catch (_b) {
            }
            return {
                ...recipe,
                likes_count: likesCount
            };
        }));
        return res
            .status(recipeResponse.status)
            .json(result);
    }
    catch (error) {
        return res
            .status(error.status || 500)
            .json(error.data || {
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецептов"
            }
        });
    }
}
async function getRecipe(req, res) {
    var _a, _b, _c, _d;
    try {
        const recipeResponse = await callService(RECIPE_SERVICE_URL, req.originalUrl, {
            method: "GET"
        });
        const recipe = recipeResponse.data;
        if (!recipe) {
            return res
                .status(recipeResponse.status)
                .json(recipe);
        }
        let userId;
        const authorization = req.headers.authorization;
        if (authorization) {
            try {
                const token = authorization
                    .replace(/^Bearer\s+/i, "")
                    .trim();
                const parts = token.split(".");
                if (parts.length === 3) {
                    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
                    if (payload &&
                        payload.userId !== undefined) {
                        userId =
                            Number(payload.userId);
                    }
                }
            }
            catch (_e) {
            }
        }
        let socialSummary = {
            likes_count: 0,
            comments_count: 0,
            is_liked_by_me: false,
            is_saved_by_me: false
        };
        try {
            const query = userId !== undefined
                ? `?user_id=${encodeURIComponent(userId)}`
                : "";
            const summary = await callService(SOCIAL_SERVICE_URL, `/internal/recipes/${recipe.recipe_id}/summary${query}`, {
                method: "GET",
                headers: {
                    "x-service-token": SERVICE_TOKEN
                }
            });
            socialSummary = {
                likes_count: Number((_a = summary.data) === null || _a === void 0 ? void 0 : _a.likes_count) || 0,
                comments_count: Number((_b = summary.data) === null || _b === void 0 ? void 0 : _b.comments_count) || 0,
                is_liked_by_me: Boolean((_c = summary.data) === null || _c === void 0 ? void 0 : _c.is_liked_by_me),
                is_saved_by_me: Boolean((_d = summary.data) === null || _d === void 0 ? void 0 : _d.is_saved_by_me)
            };
        }
        catch (_f) {
        }
        return res
            .status(recipeResponse.status)
            .json({
            ...recipe,
            ...socialSummary
        });
    }
    catch (error) {
        return res
            .status(error.status || 500)
            .json(error.data || {
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецепта"
            }
        });
    }
}
async function proxy(req, res, target) {
    try {
        const headers = {};
        if (req.headers.authorization) {
            headers["authorization"] =
                req.headers.authorization;
        }
        if (req.headers["content-type"]) {
            headers["content-type"] =
                req.headers["content-type"];
        }
        if (req.path.startsWith("/internal/")) {
            headers["x-service-token"] =
                SERVICE_TOKEN;
        }
        let body;
        if (req.method !== "GET" &&
            req.method !== "HEAD" &&
            req.body &&
            Object.keys(req.body).length > 0) {
            body =
                JSON.stringify(req.body);
            if (!headers["content-type"]) {
                headers["content-type"] =
                    "application/json";
            }
        }
        const result = await callService(target, req.originalUrl, {
            method: req.method,
            headers,
            body
        });
        return res
            .status(result.status)
            .json(result.data);
    }
    catch (error) {
        return res
            .status(error.status || 500)
            .json(error.data || {
            error: {
                code: "INTERNAL_ERROR",
                message: error.message ||
                    "Ошибка сервиса"
            }
        });
    }
}
app.get("/api/recipes", getRecipes);
app.get("/api/recipes/mine", async (req, res) => {
    return proxy(req, res, RECIPE_SERVICE_URL);
});
app.get(/^\/api\/recipes\/\d+$/, getRecipe);
app.use(async (req, res) => {
    const target = getTarget(req.path);
    if (!target) {
        return res
            .status(404)
            .json({
            error: {
                code: "NOT_FOUND",
                message: "Маршрут не найден"
            }
        });
    }
    return proxy(req, res, target);
});
app.listen(PORT, () => {
    console.log(`API Gateway running on http://localhost:${PORT}`);
});
