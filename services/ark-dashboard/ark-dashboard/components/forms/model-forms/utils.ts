import { Model, ModelCreateRequest, ModelUpdateRequest } from "@/lib/services"
import { FormValues } from "./schema"

export function createConfig(formValues: FormValues): ModelCreateRequest["config"] {
  const config: ModelCreateRequest["config"] = {}
  switch (formValues.type) {
    case "openai":
      config.openai = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: "token"
            }
          }
        },
        baseUrl: formValues.baseUrl
      }
      return config
    case "azure":
      config.azure = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: "token"
            }
          }
        },
        baseUrl: formValues.baseUrl,
        ...(formValues.azureApiVersion && { apiVersion: formValues.azureApiVersion })
      }
      return config
    case "bedrock":
      config.bedrock = {
        accessKeyId: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockAccessKeyIdSecretName,
              key: "token"
            }
          }
        },
        secretAccessKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockSecretAccessKeySecretName,
              key: "token"
            }
          }
        },
        ...(formValues.region && { region: formValues.region }),
        ...(formValues.modelARN && { modelArn: formValues.modelARN })
      }
      return config
  }
}

export function createModelUpdateConfig(formValues: FormValues): ModelUpdateRequest["config"] {
  return createConfig(formValues)
}

export function getResetValues(currentFormValues: FormValues): FormValues {
  switch (currentFormValues.type) {
    case "openai":
      return {
        name: currentFormValues.name,
        type: currentFormValues.type,
        model: currentFormValues.model,
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? ''
      }
    case "azure":
      return {
        name: currentFormValues.name,
        type: currentFormValues.type,
        model: currentFormValues.model,
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? '',
        azureApiVersion: ''
      }
    case "bedrock":
      return {
        name: currentFormValues.name,
        type: currentFormValues.type,
        model: currentFormValues.model,
        bedrockAccessKeyIdSecretName: '',
        bedrockSecretAccessKeySecretName: '',
        region: '',
        modelARN: ''
      }
  }
}

function getConfigValue<T = unknown>(config: unknown, keys: string[]): T | undefined {
  let current = config

  for (const key of keys) {
    // Check if current is null, undefined, or not an object
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined
    }

    // Get the value for the current key
    current = (current as Record<string, unknown>)[key]
  }

  return current as T
}


export function getDefaultValuesForUpdate(model: Model): FormValues {
  switch (model.type) {
    case "openai":
      return {
        name: model.name,
        type: model.type,
        model: model.model,
        secret: getConfigValue<string>(
          model.config,
          ['openai', 'apiKey', 'valueFrom', 'secretKeyRef', 'name']
        ) || '',
        baseUrl: getConfigValue<string>(model.config, ['openai', 'baseUrl', 'value']) || ''
      }
    case "azure":
      return {
        name: model.name,
        type: model.type,
        model: model.model,
        secret: getConfigValue<string>(
          model.config,
          ['azure', 'apiKey', 'valueFrom', 'secretKeyRef', 'name']
        ) || '',
        azureApiVersion: getConfigValue<string>(model.config, ['azure', 'apiVersion', 'value']) || '',
        baseUrl: getConfigValue<string>(model.config, ['azure', 'baseUrl', 'value']) || ''
      }
    case "bedrock":
      return {
        name: model.name,
        type: model.type,
        model: model.model,
        bedrockAccessKeyIdSecretName: getConfigValue<string>(model.config, ['bedrock', 'accessKeyId', 'valueFrom', 'secretKeyRef', 'name']) || '',
        bedrockSecretAccessKeySecretName: getConfigValue<string>(model.config, ['bedrock', 'secretAccessKey', 'valueFrom', 'secretKeyRef', 'name']) || '',
        region: getConfigValue<string>(model.config, ['bedrock', 'region', 'value']) || '',
        modelARN: getConfigValue<string>(model.config, ['bedrock', 'modelArn', 'value']) || ''
      }
  }
}