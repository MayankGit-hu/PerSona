use crate::models::{ChatMessage, GenerateOptions, ModelProvider};
use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::stream::BoxStream;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

pub struct AnthropicProvider {
    client: Client,
    api_key: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    max_tokens: usize,
    temperature: f32,
    stream: bool,
}

#[derive(Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicDelta>,
}

#[derive(Deserialize)]
struct AnthropicDelta {
    text: Option<String>,
}

#[async_trait]
impl ModelProvider for AnthropicProvider {
    async fn generate(
        &self,
        prompt: &str,
        options: &GenerateOptions,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        let req_body = AnthropicRequest {
            model: options.model_name.clone(),
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            system: options.system_prompt.clone(),
            max_tokens: options.max_tokens.unwrap_or(4096),
            temperature: options.temperature,
            stream: false,
        };

        let res = self.client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&req_body)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("Anthropic API returned error: {}", error_text).into());
        }

        #[derive(Deserialize)]
        struct AnthropicContent {
            text: String,
        }
        #[derive(Deserialize)]
        struct AnthropicResponse {
            content: Vec<AnthropicContent>,
        }

        let body: AnthropicResponse = res.json().await?;
        Ok(body.content.into_iter().next().map(|c| c.text).unwrap_or_default())
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: &GenerateOptions,
    ) -> Result<BoxStream<'static, Result<String, Box<dyn Error + Send + Sync>>>, Box<dyn Error + Send + Sync>> {
        let mut api_messages = Vec::new();
        for msg in messages {
            api_messages.push(AnthropicMessage {
                // Anthropic only supports "user" and "assistant" roles.
                role: if msg.role == "system" { "user".to_string() } else { msg.role.clone() },
                content: msg.content.clone(),
            });
        }

        let req_body = AnthropicRequest {
            model: options.model_name.clone(),
            messages: api_messages,
            system: options.system_prompt.clone(),
            max_tokens: options.max_tokens.unwrap_or(4096),
            temperature: options.temperature,
            stream: true,
        };

        let res = self.client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&req_body)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("Anthropic API returned error: {}", error_text).into());
        }

        let stream = res.bytes_stream().eventsource().map(|event| {
            match event {
                Ok(ev) => {
                    let data = ev.data;
                    if data == "[DONE]" || ev.event == "message_stop" {
                        Ok(String::new())
                    } else {
                        match serde_json::from_str::<AnthropicStreamEvent>(&data) {
                            Ok(parsed) => {
                                if parsed.event_type == "content_block_delta" {
                                    if let Some(delta) = parsed.delta {
                                        Ok(delta.text.unwrap_or_default())
                                    } else {
                                        Ok(String::new())
                                    }
                                } else {
                                    Ok(String::new())
                                }
                            }
                            Err(_) => {
                                // Ignore non-delta events
                                Ok(String::new())
                            }
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
        _text: &str,
        _model_name: &str,
    ) -> Result<Vec<f32>, Box<dyn Error + Send + Sync>> {
        Err("Anthropic does not support text embeddings".into())
    }

    async fn embed_batch(
        &self,
        _texts: &[String],
        _model_name: &str,
    ) -> Result<Vec<Vec<f32>>, Box<dyn Error + Send + Sync>> {
        Err("Anthropic does not support text embeddings".into())
    }

    async fn list_models(&self) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
        Ok(vec![
            "claude-3-5-sonnet-20240620".to_string(),
            "claude-3-haiku-20240307".to_string(),
        ])
    }
}
