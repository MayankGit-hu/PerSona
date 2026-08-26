use crate::models::{ChatMessage, GenerateOptions, ModelProvider, OllamaProvider};
use crate::providers_openai::OpenAIProvider;
use crate::providers_anthropic::AnthropicProvider;
use crate::db::Database;
use async_trait::async_trait;
use futures_util::stream::BoxStream;
use std::sync::Arc;
use std::error::Error;

pub struct RouterProvider {
    db: Arc<Database>,
}

impl RouterProvider {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn get_provider(&self, model_name: &str) -> Arc<dyn ModelProvider> {
        if model_name.starts_with("gpt-") || model_name.starts_with("text-embedding") {
            if let Ok(Some(key)) = self.db.get_setting("openai_api_key") {
                if !key.is_empty() {
                    return Arc::new(OpenAIProvider::new(key));
                }
            }
        } else if model_name.starts_with("claude-") {
            if let Ok(Some(key)) = self.db.get_setting("anthropic_api_key") {
                if !key.is_empty() {
                    return Arc::new(AnthropicProvider::new(key));
                }
            }
        }
        
        let ollama_url = self.db.get_setting("ollama_base_url")
            .unwrap_or(None)
            .unwrap_or_else(|| "http://localhost:11434".to_string());
            
        Arc::new(OllamaProvider::new(ollama_url))
    }
}

#[async_trait]
impl ModelProvider for RouterProvider {
    async fn generate(
        &self,
        prompt: &str,
        options: &GenerateOptions,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        self.get_provider(&options.model_name).generate(prompt, options).await
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: &GenerateOptions,
    ) -> Result<BoxStream<'static, Result<String, Box<dyn Error + Send + Sync>>>, Box<dyn Error + Send + Sync>> {
        self.get_provider(&options.model_name).chat_stream(messages, options).await
    }

    async fn embed(
        &self,
        text: &str,
        model_name: &str,
    ) -> Result<Vec<f32>, Box<dyn Error + Send + Sync>> {
        self.get_provider(model_name).embed(text, model_name).await
    }

    async fn embed_batch(
        &self,
        texts: &[String],
        model_name: &str,
    ) -> Result<Vec<Vec<f32>>, Box<dyn Error + Send + Sync>> {
        self.get_provider(model_name).embed_batch(texts, model_name).await
    }

    async fn list_models(&self) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
        let mut models = Vec::new();
        
        let ollama_url = self.db.get_setting("ollama_base_url")
            .unwrap_or(None)
            .unwrap_or_else(|| "http://localhost:11434".to_string());
            
        let ollama = OllamaProvider::new(ollama_url);
        if let Ok(mut local_models) = ollama.list_models().await {
            models.append(&mut local_models);
        }
        
        // Add cloud models
        models.push("gpt-4o".to_string());
        models.push("gpt-4o-mini".to_string());
        models.push("claude-3-5-sonnet-20240620".to_string());
        models.push("claude-3-haiku-20240307".to_string());
        
        Ok(models)
    }
}
