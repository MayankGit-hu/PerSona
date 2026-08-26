use crate::models::{ChatMessage, GenerateOptions, ModelProvider};
use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::stream::BoxStream;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

pub struct OpenAIProvider {
    client: Client,
    api_key: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }
}

#[derive(Serialize, Deserialize)]
struct OpenAIChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIChatMessage>,
    temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<usize>,
    stream: bool,
}

#[derive(Deserialize)]
struct OpenAIChatChoiceDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAIChatChoice {
    delta: OpenAIChatChoiceDelta,
}

#[derive(Deserialize)]
struct OpenAIChatResponse {
    choices: Vec<OpenAIChatChoice>,
}

#[derive(Serialize)]
struct OpenAIEmbedRequest {
    input: Vec<String>,
    model: String,
}

#[derive(Deserialize)]
struct OpenAIEmbedData {
    embedding: Vec<f32>,
}

#[derive(Deserialize)]
struct OpenAIEmbedResponse {
    data: Vec<OpenAIEmbedData>,
}

#[async_trait]
impl ModelProvider for OpenAIProvider {
    async fn generate(
        &self,
        prompt: &str,
        options: &GenerateOptions,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        let req_body = OpenAIChatRequest {
            model: options.model_name.clone(),
            messages: vec![OpenAIChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stream: false,
        };

        let res = self.client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req_body)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("OpenAI API returned error: {}", error_text).into());
        }

        #[derive(Deserialize)]
        struct NonStreamChoice {
            message: OpenAIChatMessage,
        }
        #[derive(Deserialize)]
        struct NonStreamResponse {
            choices: Vec<NonStreamChoice>,
        }

        let body: NonStreamResponse = res.json().await?;
        Ok(body.choices.into_iter().next().map(|c| c.message.content).unwrap_or_default())
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: &GenerateOptions,
    ) -> Result<BoxStream<'static, Result<String, Box<dyn Error + Send + Sync>>>, Box<dyn Error + Send + Sync>> {
        let mut api_messages = Vec::new();
        if let Some(sys_prompt) = &options.system_prompt {
            api_messages.push(OpenAIChatMessage {
                role: "system".to_string(),
                content: sys_prompt.clone(),
            });
        }
        for msg in messages {
            api_messages.push(OpenAIChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        let req_body = OpenAIChatRequest {
            model: options.model_name.clone(),
            messages: api_messages,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stream: true,
        };

        let res = self.client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req_body)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("OpenAI API returned error: {}", error_text).into());
        }

        let stream = res.bytes_stream().eventsource().map(|event| {
            match event {
                Ok(ev) => {
                    let data = ev.data;
                    if data == "[DONE]" {
                        Ok(String::new())
                    } else {
                        match serde_json::from_str::<OpenAIChatResponse>(&data) {
                            Ok(parsed) => {
                                if let Some(choice) = parsed.choices.first() {
                                    if let Some(content) = &choice.delta.content {
                                        Ok(content.clone())
                                    } else {
                                        Ok(String::new())
                                    }
                                } else {
                                    Ok(String::new())
                                }
                            }
                            Err(e) => Err(Box::new(e) as Box<dyn Error + Send + Sync>),
                        }
                    }
                }
                Err(e) => Err(Box::new(e) as Box<dyn Error + Send + Sync>),
            }
        });

        Ok(Box::pin(stream))
    }

    async fn embed(
        &self,
        text: &str,
        _model_name: &str,
    ) -> Result<Vec<f32>, Box<dyn Error + Send + Sync>> {
        self.embed_batch(&[text.to_string()], _model_name).await.map(|mut v| v.remove(0))
    }

    async fn embed_batch(
        &self,
        texts: &[String],
        _model_name: &str,
    ) -> Result<Vec<Vec<f32>>, Box<dyn Error + Send + Sync>> {
        let req_body = OpenAIEmbedRequest {
            input: texts.to_vec(),
            model: "text-embedding-3-small".to_string(), // Default fallback if needed
        };

        let res = self.client.post("https://api.openai.com/v1/embeddings")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req_body)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("OpenAI API returned error: {}", error_text).into());
        }

        let body: OpenAIEmbedResponse = res.json().await?;
        let mut embeddings = vec![Vec::new(); texts.len()];
        for data in body.data {
            embeddings.push(data.embedding);
        }
        embeddings.retain(|v| !v.is_empty());
        Ok(embeddings)
    }

    async fn list_models(&self) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
        Ok(vec![
            "gpt-4o".to_string(),
            "gpt-4o-mini".to_string(),
        ])
    }
}
