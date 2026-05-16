package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"

	"github.com/its-rory/translate/backend/internal/config"
	"github.com/its-rory/translate/backend/internal/database"
	"github.com/its-rory/translate/backend/internal/handler"
	"github.com/its-rory/translate/backend/internal/middleware"
	"github.com/its-rory/translate/backend/internal/service"
)

func main() {
	cfg := config.GetConfig()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	if err := database.InitDB(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	authService := service.NewAuthService()
	userService := service.NewUserService()
	providerService := service.NewProviderService()
	translateService := service.NewTranslateService()
	preferenceService := service.NewPreferenceService()

	authHandler := handler.NewAuthHandler(authService)
	userHandler := handler.NewUserHandler(userService)
	providerHandler := handler.NewProviderHandler(providerService)
	modelHandler := handler.NewModelHandler()
	translateHandler := handler.NewTranslateHandler(translateService)
	promptHandler := handler.NewPromptHandler()
	preferenceHandler := handler.NewPreferenceHandler(preferenceService)

	router := gin.Default()

	router.Use(corsMiddleware())

	v1 := router.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.RefreshToken)
			auth.POST("/logout", authHandler.Logout)
		}

		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware(authService))
		{
			protected.GET("/auth/me", authHandler.Me)

			users := protected.Group("/users")
			users.Use(middleware.AdminMiddleware())
			{
				users.GET("", userHandler.List)
				users.GET("/:id", userHandler.GetByID)
				users.POST("", userHandler.Create)
				users.PUT("/:id", userHandler.Update)
				users.DELETE("/:id", userHandler.Delete)
			}

			providers := protected.Group("/providers")
			{
				providers.GET("", providerHandler.List)
				providers.GET("/:id", providerHandler.GetByID)
				providers.POST("", providerHandler.Create)
				providers.PUT("/:id", providerHandler.Update)
				providers.DELETE("/:id", providerHandler.Delete)
			}

			models := protected.Group("/providers")
			{
				models.GET("/:id/models", modelHandler.ListByProvider)
			}

			prompts := protected.Group("/prompts")
			{
				prompts.GET("", promptHandler.List)
				prompts.GET("/:id", promptHandler.GetByID)
				prompts.POST("", promptHandler.Create)
				prompts.PUT("/:id", promptHandler.Update)
				prompts.DELETE("/:id", promptHandler.Delete)
			}

			translates := protected.Group("/translate")
			{
				translates.POST("", translateHandler.Translate)
				translates.POST("/stream", translateHandler.StreamTranslate)
			}

			preferences := protected.Group("/preferences")
			{
				preferences.GET("", preferenceHandler.Get)
				preferences.PUT("", preferenceHandler.Upsert)
			}
		}
	}

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
