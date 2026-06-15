from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.events import registry

router = APIRouter(tags=["ws"])


@router.websocket("/ws/{run_id}")
async def run_socket(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    bus = registry.get(run_id)
    if bus is None:
        await websocket.send_json({"kind": "error", "label": "unknown run_id"})
        await websocket.close()
        return

    try:
        async for event in bus.subscribe():
            await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        return
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
