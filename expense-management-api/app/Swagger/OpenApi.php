<?php

namespace App\Swagger;

use OpenApi\Annotations as OA;

/**
 * @OA\Info(
 *     title="SpendWise API",
 *     version="1.0.0",
 *     description="API for managing expenses, budgets, balances and group contexts"
 * )
 *
 * @OA\Server(
 *     url="http://expense-management-api.test//api",
 *     description="Local Server"
 * )
 *
 * @OA\SecurityScheme(
 *     securityScheme="bearerAuth",
 *     type="http",
 *     scheme="bearer",
 *     bearerFormat="JWT"
 * )
 */
class OpenApi {}