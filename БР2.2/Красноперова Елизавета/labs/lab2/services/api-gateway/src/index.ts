import express, {
    Request,
    Response
} from "express";

const app = express();

app.use(express.json());

const PORT = 3000;

const USER_SERVICE_URL =
    process.env.USER_SERVICE_URL ||
    "http://localhost:3001";

const RECIPE_SERVICE_URL =
    process.env.RECIPE_SERVICE_URL ||
    "http://localhost:3002";

const SOCIAL_SERVICE_URL =
    process.env.SOCIAL_SERVICE_URL ||
    "http://localhost:3003";

const SERVICE_TOKEN =
    process.env.SERVICE_TOKEN ||
    "internal-service-token";


async function callService(
    baseUrl: string,
    path: string,
    options: any = {}
) {
    const response = await fetch(
        baseUrl + path,
        options
    );

    let data: any;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const error: any = new Error(
            data?.error?.message ||
            data?.message ||
            "Ошибка сервиса"
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return {
        status: response.status,
        data
    };
}


function getTarget(
    path: string
): string | null {

    if (
        /^\/api\/recipes\/\d+\/(like|save|comments)/.test(path)
    ) {
        return SOCIAL_SERVICE_URL;
    }

    if (
        /^\/api\/users\/\d+\/subscribe/.test(path)
    ) {
        return SOCIAL_SERVICE_URL;
    }

    if (
        path === "/api/users/me/subscriptions" ||
        path === "/api/users/me/subscribers" ||
        path === "/api/users/me/saved"
    ) {
        return SOCIAL_SERVICE_URL;
    }

    if (
        /^\/api\/comments/.test(path)
    ) {
        return SOCIAL_SERVICE_URL;
    }

    if (
        path === "/api/recipes" ||
        path === "/api/recipes/mine" ||
        /^\/api\/recipes\/\d+/.test(path)
    ) {
        return RECIPE_SERVICE_URL;
    }

    if (
        /^\/api\/auth/.test(path)
    ) {
        return USER_SERVICE_URL;
    }

    if (
        path === "/api/users/me/recipes"
    ) {
        return RECIPE_SERVICE_URL;
    }

    if (
        /^\/api\/users/.test(path)
    ) {
        return USER_SERVICE_URL;
    }

    return null;
}



async function getRecipes(
    req: Request,
    res: Response
) {
    try {
        const recipeResponse =
            await callService(
                RECIPE_SERVICE_URL,
                req.originalUrl,
                {
                    method: "GET"
                }
            );

        const recipes = Array.isArray(
            recipeResponse.data
        )
            ? recipeResponse.data
            : [];

        const result = await Promise.all(
            recipes.map(async (recipe: any) => {

                let likesCount = 0;

                try {
                    const summary =
                        await callService(
                            SOCIAL_SERVICE_URL,
                            `/internal/recipes/${recipe.recipe_id}/summary`,
                            {
                                method: "GET",
                                headers: {
                                    "x-service-token":
                                        SERVICE_TOKEN
                                }
                            }
                        );

                    likesCount =
                        Number(
                            summary.data?.likes_count
                        ) || 0;

                } catch {
                   
                }

                return {
                    ...recipe,
                    likes_count: likesCount
                };
            })
        );

        return res
            .status(recipeResponse.status)
            .json(result);

    } catch (error: any) {

        return res
            .status(error.status || 500)
            .json(
                error.data || {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Ошибка получения рецептов"
                    }
                }
            );
    }
}



async function getRecipe(
    req: Request,
    res: Response
) {
    try {

        const recipeResponse =
            await callService(
                RECIPE_SERVICE_URL,
                req.originalUrl,
                {
                    method: "GET"
                }
            );

        const recipe =
            recipeResponse.data;

        if (!recipe) {
            return res
                .status(recipeResponse.status)
                .json(recipe);
        }

        
        let userId: number | undefined;

        const authorization =
            req.headers.authorization;

        if (authorization) {
            try {
                const token =
                    authorization
                        .replace(/^Bearer\s+/i, "")
                        .trim();

                const parts =
                    token.split(".");

                if (parts.length === 3) {

                    const payload =
                        JSON.parse(
                            Buffer.from(
                                parts[1],
                                "base64url"
                            ).toString("utf8")
                        );

                    if (
                        payload &&
                        payload.userId !== undefined
                    ) {
                        userId =
                            Number(payload.userId);
                    }
                }

            } catch {
                
            }
        }


        
        let socialSummary: any = {
            likes_count: 0,
            comments_count: 0,
            is_liked_by_me: false,
            is_saved_by_me: false
        };

        try {

            const query =
                userId !== undefined
                    ? `?user_id=${encodeURIComponent(userId)}`
                    : "";

            const summary =
                await callService(
                    SOCIAL_SERVICE_URL,
                    `/internal/recipes/${recipe.recipe_id}/summary${query}`,
                    {
                        method: "GET",
                        headers: {
                            "x-service-token":
                                SERVICE_TOKEN
                        }
                    }
                );

            socialSummary = {
                likes_count:
                    Number(
                        summary.data?.likes_count
                    ) || 0,

                comments_count:
                    Number(
                        summary.data?.comments_count
                    ) || 0,

                is_liked_by_me:
                    Boolean(
                        summary.data?.is_liked_by_me
                    ),

                is_saved_by_me:
                    Boolean(
                        summary.data?.is_saved_by_me
                    )
            };

        } catch {
           
        }


        return res
            .status(recipeResponse.status)
            .json({
                ...recipe,
                ...socialSummary
            });

    } catch (error: any) {

        return res
            .status(error.status || 500)
            .json(
                error.data || {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Ошибка получения рецепта"
                    }
                }
            );
    }
}



async function proxy(
    req: Request,
    res: Response,
    target: string
) {
    try {

        const headers: Record<string, string> = {};


        if (req.headers.authorization) {
            headers["authorization"] =
                req.headers.authorization;
        }


        if (req.headers["content-type"]) {
            headers["content-type"] =
                req.headers["content-type"];
        }


        if (
            req.path.startsWith("/internal/")
        ) {
            headers["x-service-token"] =
                SERVICE_TOKEN;
        }


        let body: string | undefined;


        if (
            req.method !== "GET" &&
            req.method !== "HEAD" &&
            req.body &&
            Object.keys(req.body).length > 0
        ) {

            body =
                JSON.stringify(req.body);

            if (!headers["content-type"]) {
                headers["content-type"] =
                    "application/json";
            }
        }


        const result =
            await callService(
                target,
                req.originalUrl,
                {
                    method: req.method,
                    headers,
                    body
                }
            );


        return res
            .status(result.status)
            .json(result.data);

    } catch (error: any) {

        return res
            .status(error.status || 500)
            .json(
                error.data || {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            error.message ||
                            "Ошибка сервиса"
                    }
                }
            );
    }
}



app.get(
    "/api/recipes",
    getRecipes
);



app.get(
    "/api/recipes/mine",
    async (req: Request, res: Response) => {

        return proxy(
            req,
            res,
            RECIPE_SERVICE_URL
        );
    }
);



app.get(
    /^\/api\/recipes\/\d+$/,
    getRecipe
);



app.use(
    async (
        req: Request,
        res: Response
    ) => {

        const target =
            getTarget(req.path);

        if (!target) {

            return res
                .status(404)
                .json({
                    error: {
                        code: "NOT_FOUND",
                        message:
                            "Маршрут не найден"
                    }
                });
        }


        return proxy(
            req,
            res,
            target
        );
    }
);


app.listen(
    PORT,
    () => {

        console.log(
            `API Gateway running on http://localhost:${PORT}`
        );

    }
);