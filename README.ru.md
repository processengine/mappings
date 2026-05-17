# @processengine/mappings v3

Декларативная библиотека преобразования данных для ProcessEngine Flow 5.

Библиотека делает одну работу:

```text
prepared mapping + input object -> { output }
```

Она не знает flow-граф, `ProcessState`, эффекты, ожидания и маршрутизацию. Композиция нескольких преобразований находится в `@processengine/dataflows`.

## Канонический lifecycle

```text
validateMappings -> prepareMappings -> executeMappings
```

## Source artifact v3

```ts
interface MappingDefinitionV3 {
  mappingId: string;
  kind: 'payload' | 'facts' | 'result';
  title: string;
  description: string;
  output: Record<TargetPath, MappingExpression>;
  metadata?: Record<string, JsonValue>;
}
```

`output` обязан быть непустым объектом. Поля `sources`, `version`, `compiledPlan` в source запрещены.

## Runtime result

```ts
interface ExecuteMappingsResult {
  output: JsonObject;
  trace?: MappingTraceEvent[];
}
```

`output` и `trace`, если возвращается, обязаны быть JSON-safe / transport-safe.

## Главное отличие от v2

```text
v2: sources.input.name
v3: $.name
```

`mappings v3` принимает один input object и не поддерживает named sources.
