 import { Request, Response as ExpressResponse } from "express";
import { AppDataSource } from "../index";
import { Recipe } from "../entity/Recipe";
import { AuthRequest } from "../middleware/auth";

const recipes = () =>
    AppDataSource.getRepository(Recipe);

const token = () =>
    process.env.SERVICE_TOKEN || "internal-service-token";

const userUrl = () =>
    process.env.USER_SERVICE_URL || "http://localhost:3001";

async function call(
    base: string,
    path: string,
    options: any = {}
) {
    const response = await fetch(base + path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            "x-service-token": token(),
            "content-type": "application/json"
        }
    });

    if (!response.ok) {
        let error: any = {};

        try {
            error = await response.json();
        } catch {
           
        }

        throw new DependencyError(
            response.status,
            error?.code || "DEPENDENCY_ERROR",
            error?.message || "Ошибка зависимого сервиса"
        );
    }

    return response.json();
}

class DependencyError extends Error {
    status: number;
    code: string;

    constructor(
        status: number,
        code: string,
        message: string
    ) {
        super(message);
        this.name = "DependencyError";
        this.status = status;
        this.code = code;
    }
}

export class RecipeController {

   
    static getAll = async (
        req: AuthRequest,
        res: ExpressResponse
    ) => {
        try {
            const rows = await recipes().find({
                order: {
                    recipe_id: "ASC"
                }
            });

            const result = await Promise.all(
                rows.map(async (recipe) => {
                    let author: any = {
                        user_id: recipe.author_id
                    };

                    try {
                        author = await call(
                            userUrl(),
                            `/internal/users/${recipe.author_id}`
                        );
                    } catch {
                        
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
                })
            );

            return res.json(result);

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка получения рецептов"
                }
            });
        }
    };


   
    static getMine = async (
        req: AuthRequest,
        res: ExpressResponse
    ) => {
        try {
            const userId = req.userId!;

            const result = await recipes().find({
                where: {
                    author_id: userId
                },
                order: {
                    recipe_id: "ASC"
                }
            });

            return res.json(result);

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка получения рецептов пользователя"
                }
            });
        }
    };


   
    static getOne = async (
        req: Request,
        res: ExpressResponse
    ) => {
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

            let author: any = {
                user_id: recipe.author_id
            };

            try {
                author = await call(
                    userUrl(),
                    `/internal/users/${recipe.author_id}`
                );
            } catch {
                
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

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка получения рецепта"
                }
            });
        }
    };


    
    static create = async (
        req: AuthRequest,
        res: ExpressResponse
    ) => {
        try {
            const authorId = req.userId!;

            
            await call(
                userUrl(),
                `/internal/users/${authorId}/exists`
            );

            const recipe = recipes().create({
                ...req.body,
                author_id: authorId
            });

            const saved = await recipes().save(recipe);

            return res.status(201).json(saved);

        } catch (error: any) {

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


    
    static update = async (
        req: AuthRequest,
        res: ExpressResponse
    ) => {
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

            await recipes().update(
                recipeId,
                req.body
            );

            const updated = await recipes().findOne({
                where: {
                    recipe_id: recipeId
                }
            });

            return res.json(updated);

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка обновления рецепта"
                }
            });
        }
    };


    
    static delete = async (
        req: AuthRequest,
        res: ExpressResponse
    ) => {
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

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка удаления рецепта"
                }
            });
        }
    };


    
    static internalGet = async (
        req: Request,
        res: ExpressResponse
    ) => {
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

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка получения рецепта"
                }
            });
        }
    };


    
    static internalExists = async (
        req: Request,
        res: ExpressResponse
    ) => {
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

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка проверки рецепта"
                }
            });
        }
    };


    
    static internalByAuthor = async (
        req: Request,
        res: ExpressResponse
    ) => {
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

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка получения рецептов пользователя"
                }
            });
        }
    };


    
    static internalByIds = async (
        req: Request,
        res: ExpressResponse
    ) => {
        try {
            let ids: number[] = [];

            if (Array.isArray(req.body?.recipe_ids)) {
                ids = req.body.recipe_ids
                    .map(Number)
                    .filter((id: number) => !Number.isNaN(id));
            }

            if (
                ids.length === 0 &&
                typeof req.query.ids === "string"
            ) {
                ids = req.query.ids
                    .split(",")
                    .map(Number)
                    .filter((id: number) => !Number.isNaN(id));
            }

            if (ids.length === 0) {
                return res.json([]);
            }

            const result = await recipes()
                .createQueryBuilder("recipe")
                .where(
                    "recipe.recipe_id IN (:...ids)",
                    { ids }
                )
                .getMany();

            return res.json(result);

        } catch {
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Ошибка получения рецептов"
                }
            });
        }
    };
}