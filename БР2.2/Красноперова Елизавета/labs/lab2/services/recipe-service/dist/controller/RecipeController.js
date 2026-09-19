"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipeController = void 0;
const index_1 = require("../index");
const Recipe_1 = require("../entity/Recipe");
const recipes = () => index_1.AppDataSource.getRepository(Recipe_1.Recipe);
const token = () => process.env.SERVICE_TOKEN || "internal-service-token";
const userUrl = () => process.env.USER_SERVICE_URL || "http://localhost:3001";
async function call(base, path, options = {}) {
    const response = await fetch(base + path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            "x-service-token": token(),
            "content-type": "application/json"
        }
    });
    if (!response.ok) {
        let error = {};
        try {
            error = await response.json();
        }
        catch (_b) {
        }
        throw new DependencyError(response.status, (error === null || error === void 0 ? void 0 : error.code) || "DEPENDENCY_ERROR", (error === null || error === void 0 ? void 0 : error.message) || "Ошибка зависимого сервиса");
    }
    return response.json();
}
class DependencyError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "DependencyError";
        this.status = status;
        this.code = code;
    }
}
class RecipeController {
}
exports.RecipeController = RecipeController;
_a = RecipeController;
RecipeController.getAll = async (req, res) => {
    try {
        const rows = await recipes().find({
            order: {
                recipe_id: "ASC"
            }
        });
        const result = await Promise.all(rows.map(async (recipe) => {
            let author = {
                user_id: recipe.author_id
            };
            try {
                author = await call(userUrl(), `/internal/users/${recipe.author_id}`);
            }
            catch (_b) {
            }
            return {
                recipe_id: recipe.recipe_id,
                title: recipe.title,
                description: recipe.description,
                photo_main_url: recipe.photo_main_url,
                cooking_time_min: recipe.cooking_time_min,
                difficulty: recipe.difficulty,
                dish_type: recipe.dish_type,
                author_id: recipe.author_id,
                author,
                published_at: recipe.published_at
            };
        }));
        return res.json(result);
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецептов"
            }
        });
    }
};
RecipeController.getMine = async (req, res) => {
    try {
        const userId = req.userId;
        const result = await recipes().find({
            where: {
                author_id: userId
            },
            order: {
                recipe_id: "ASC"
            }
        });
        return res.json(result);
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецептов пользователя"
            }
        });
    }
};
RecipeController.getOne = async (req, res) => {
    try {
        const recipeId = Number(req.params.recipe_id);
        const recipe = await recipes().findOne({
            where: {
                recipe_id: recipeId
            }
        });
        if (!recipe) {
            return res.status(404).json({
                error: {
                    code: "RECIPE_NOT_FOUND",
                    message: "Рецепт не найден"
                }
            });
        }
        let author = {
            user_id: recipe.author_id
        };
        try {
            author = await call(userUrl(), `/internal/users/${recipe.author_id}`);
        }
        catch (_b) {
        }
        return res.json({
            recipe_id: recipe.recipe_id,
            title: recipe.title,
            description: recipe.description,
            photo_main_url: recipe.photo_main_url,
            cooking_time_min: recipe.cooking_time_min,
            difficulty: recipe.difficulty,
            dish_type: recipe.dish_type,
            author_id: recipe.author_id,
            author,
            published_at: recipe.published_at
        });
    }
    catch (_c) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецепта"
            }
        });
    }
};
RecipeController.create = async (req, res) => {
    try {
        const authorId = req.userId;
        await call(userUrl(), `/internal/users/${authorId}/exists`);
        const recipe = recipes().create({
            ...req.body,
            author_id: authorId
        });
        const saved = await recipes().save(recipe);
        return res.status(201).json(saved);
    }
    catch (error) {
        if (error instanceof DependencyError) {
            if (error.status === 404) {
                return res.status(404).json({
                    error: {
                        code: "USER_NOT_FOUND",
                        message: "Пользователь не найден"
                    }
                });
            }
            return res.status(503).json({
                error: {
                    code: "SERVICE_UNAVAILABLE",
                    message: "UserService недоступен"
                }
            });
        }
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка создания рецепта"
            }
        });
    }
};
RecipeController.update = async (req, res) => {
    try {
        const recipeId = Number(req.params.recipe_id);
        const recipe = await recipes().findOne({
            where: {
                recipe_id: recipeId
            }
        });
        if (!recipe) {
            return res.status(404).json({
                error: {
                    code: "RECIPE_NOT_FOUND",
                    message: "Рецепт не найден"
                }
            });
        }
        if (recipe.author_id !== req.userId) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Нет прав на изменение этого рецепта"
                }
            });
        }
        await recipes().update(recipeId, req.body);
        const updated = await recipes().findOne({
            where: {
                recipe_id: recipeId
            }
        });
        return res.json(updated);
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка обновления рецепта"
            }
        });
    }
};
RecipeController.delete = async (req, res) => {
    try {
        const recipeId = Number(req.params.recipe_id);
        const recipe = await recipes().findOne({
            where: {
                recipe_id: recipeId
            }
        });
        if (!recipe) {
            return res.status(404).json({
                error: {
                    code: "RECIPE_NOT_FOUND",
                    message: "Рецепт не найден"
                }
            });
        }
        if (recipe.author_id !== req.userId) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Нет прав на удаление этого рецепта"
                }
            });
        }
        await recipes().delete(recipeId);
        return res.status(204).send();
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка удаления рецепта"
            }
        });
    }
};
RecipeController.internalGet = async (req, res) => {
    try {
        const recipeId = Number(req.params.recipe_id);
        const recipe = await recipes().findOne({
            where: {
                recipe_id: recipeId
            }
        });
        if (!recipe) {
            return res.status(404).json({
                error: {
                    code: "RECIPE_NOT_FOUND",
                    message: "Рецепт не найден"
                }
            });
        }
        return res.json(recipe);
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецепта"
            }
        });
    }
};
RecipeController.internalExists = async (req, res) => {
    try {
        const recipeId = Number(req.params.recipe_id);
        const exists = await recipes().exist({
            where: {
                recipe_id: recipeId
            }
        });
        if (!exists) {
            return res.status(404).json({
                error: {
                    code: "RECIPE_NOT_FOUND",
                    message: "Рецепт не найден"
                }
            });
        }
        return res.json({
            recipe_id: recipeId,
            exists: true
        });
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка проверки рецепта"
            }
        });
    }
};
RecipeController.internalByAuthor = async (req, res) => {
    try {
        const userId = Number(req.params.user_id);
        const result = await recipes().find({
            where: {
                author_id: userId
            },
            order: {
                recipe_id: "ASC"
            }
        });
        return res.json(result);
    }
    catch (_b) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецептов пользователя"
            }
        });
    }
};
RecipeController.internalByIds = async (req, res) => {
    var _b;
    try {
        let ids = [];
        if (Array.isArray((_b = req.body) === null || _b === void 0 ? void 0 : _b.recipe_ids)) {
            ids = req.body.recipe_ids
                .map(Number)
                .filter((id) => !Number.isNaN(id));
        }
        if (ids.length === 0 &&
            typeof req.query.ids === "string") {
            ids = req.query.ids
                .split(",")
                .map(Number)
                .filter((id) => !Number.isNaN(id));
        }
        if (ids.length === 0) {
            return res.json([]);
        }
        const result = await recipes()
            .createQueryBuilder("recipe")
            .where("recipe.recipe_id IN (:...ids)", { ids })
            .getMany();
        return res.json(result);
    }
    catch (_c) {
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Ошибка получения рецептов"
            }
        });
    }
};
