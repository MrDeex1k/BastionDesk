from concurrent import futures
from contextlib import asynccontextmanager

import grpc
from fastapi import FastAPI
from transformers import AutoModelForCausalLM, AutoTokenizer

import generated.incident_classifier_pb2 as incident_classifier_pb2
import generated.incident_classifier_pb2_grpc as incident_classifier_pb2_grpc

MODEL_NAME = "google/gemma-3-1b-it"
MODEL_LOAD_ERROR = ""

try:
	tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
	model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
	MODEL_LOADED = True
	print(
		"Model Gemma 3 1B został pomyślnie załadowany. "
		"Aplikacja LLM Service jest gotowa do działania.",
	)
except Exception as load_error:
	tokenizer = None
	model = None
	MODEL_LOADED = False
	MODEL_LOAD_ERROR = str(load_error)
	print(f"Błąd podczas ładowania modelu Gemma 3 1B: {MODEL_LOAD_ERROR}")


def normalize_category(response: str) -> str:
	for category in ("Czerwony", "Żółty", "Zielony"):
		if category.lower() in response.lower():
			return category
	raise ValueError(f"Unsupported category returned by model: {response}")


def run_inference(prompt: str) -> str:
	if not MODEL_LOADED or tokenizer is None or model is None:
		raise RuntimeError("Model is not available")

	messages = [
		{
			"role": "user",
			"content": (
				"Twoim zadaniem jest przeanalizowanie opisu incydentu związanego z bezpieczeństwem komputerowym i podanie kategorii incydentu. Kategorie to Czerwony, Żółty, Zielony. Czerwony to najwyższy priorytet, Żółty to średni priorytet, Zielony to najniższy priorytet. Nie przesadzaj w ocenie, ale zachowaj zdrowy rozsądek. Jeśli komuś klawiatura zmienia znaki (np. Z na Y, to nie musi od razu oznaczać incydentu jako Czerwonego). Treść incydentu to: "
				+ prompt
			),
		}
	]

	inputs = tokenizer.apply_chat_template(
		messages,
		add_generation_prompt=True,
		tokenize=True,
		return_dict=True,
		return_tensors="pt",
	).to(model.device)

	outputs = model.generate(**inputs, max_new_tokens=40)
	decoded = tokenizer.decode(
		outputs[0][inputs["input_ids"].shape[-1] :],
		skip_special_tokens=True,
	).strip()
	print(f"[LLM] Raw model response: {decoded}")
	return normalize_category(decoded)


class IncidentClassifierService(
	incident_classifier_pb2_grpc.IncidentClassifierServicer,
):
	def ClassifyIncident(self, request, context):
		try:
			category = run_inference(request.description)
			print(
				f"[LLM] Incident {request.incident_id} classified as {category}",
			)
		except Exception as exc:
			context.set_code(grpc.StatusCode.INTERNAL)
			context.set_details(str(exc))
			return incident_classifier_pb2.ClassifyIncidentResponse()

		return incident_classifier_pb2.ClassifyIncidentResponse(
			category=category,
			model_name=MODEL_NAME,
		)


def build_grpc_server() -> grpc.Server:
	with open("/certs/ca/ca.crt", "rb") as ca_file:
		ca_cert = ca_file.read()
	with open("/certs/llm_service/server.crt", "rb") as cert_file:
		server_cert = cert_file.read()
	with open("/certs/llm_service/server.key", "rb") as key_file:
		server_key = key_file.read()

	server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
	incident_classifier_pb2_grpc.add_IncidentClassifierServicer_to_server(
		IncidentClassifierService(),
		server,
	)
	server_credentials = grpc.ssl_server_credentials(
		[(server_key, server_cert)],
		root_certificates=ca_cert,
		require_client_auth=True,
	)
	server.add_secure_port("[::]:8443", server_credentials)
	return server


@asynccontextmanager
async def lifespan(_app: FastAPI):
	grpc_server = build_grpc_server()
	grpc_server.start()
	try:
		yield
	finally:
		grpc_server.stop(grace=5)


app = FastAPI(title="LLM Service", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
	status = {"model": MODEL_NAME, "loaded": MODEL_LOADED, "grpc_port": 8443}
	if not MODEL_LOADED:
		status["error"] = MODEL_LOAD_ERROR
	return status
