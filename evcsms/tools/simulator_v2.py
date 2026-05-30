
import asyncio
import logging
import websockets
from ocpp.v16 import ChargePoint as cp16
from ocpp.v16 import call as call16
from ocpp.v201 import ChargePoint as cp201
from ocpp.v201 import call as call201
from ocpp.v201.enums import RegistrationStatusType, TransactionEventEnumType, TriggerReasonEnumType

logging.basicConfig(level=logging.INFO)

class ChargePoint16(cp16):
    async def send_boot_notification(self):
        request = call16.BootNotificationPayload(
            charge_point_vendor="Simulator",
            charge_point_model="Sim-1.6"
        )
        response = await self.call(request)
        if response.status == 'Accepted':
            logging.info("Connected to central system.")

    async def start_transaction(self, connector_id, id_tag):
        request = call16.StartTransactionPayload(
            connector_id=connector_id,
            id_tag=id_tag,
            meter_start=0,
            timestamp="2026-05-19T14:10:00Z"
        )
        response = await self.call(request)
        return response.transaction_id

    async def stop_transaction(self, transaction_id, id_tag):
        request = call16.StopTransactionPayload(
            transaction_id=transaction_id,
            id_tag=id_tag,
            meter_stop=1000,
            timestamp="2026-05-19T14:15:00Z"
        )
        await self.call(request)

class ChargePoint201(cp201):
    async def send_boot_notification(self):
        request = call201.BootNotificationPayload(
            charging_station={
                'vendor_name': 'Simulator',
                'model': 'Sim-2.0.1'
            },
            reason='PowerUp'
        )
        response = await self.call(request)
        if response.status == RegistrationStatusType.accepted:
            logging.info("Connected to central system (v2.0.1).")

    async def start_transaction(self, evse_id, id_token):
        # Start transaction event
        request = call201.TransactionEventPayload(
            event_type=TransactionEventEnumType.started,
            timestamp="2026-05-19T14:10:00Z",
            trigger_reason=TriggerReasonEnumType.authorized,
            seq_no=0,
            transaction_info={'transaction_id': 'tx-sim-201'},
            id_token={'id_token': id_token, 'type': 'ISO14443'},
            evse={'id': evse_id, 'connector_id': 1}
        )
        await self.call(request)

    async def stop_transaction(self):
        # Ended transaction event
        request = call201.TransactionEventPayload(
            event_type=TransactionEventEnumType.ended,
            timestamp="2026-05-19T14:15:00Z",
            trigger_reason=TriggerReasonEnumType.stop_authorized,
            seq_no=1,
            transaction_info={'transaction_id': 'tx-sim-201'},
            evse={'id': 1, 'connector_id': 1}
        )
        await self.call(request)

async def simulate_cp16(cp_id):
    url = f"ws://localhost:9000/ocpp/{cp_id}"
    async with websockets.connect(url, subprotocols=['ocpp1.6']) as ws:
        cp = ChargePoint16(cp_id, ws)
        await asyncio.gather(cp.start(), cp.send_boot_notification())
        logging.info(f"[{cp_id}] Simulating charge session...")
        tx_id = await cp.start_transaction(connector_id=1, id_tag="8B3D028A")
        await asyncio.sleep(2)
        await cp.stop_transaction(transaction_id=tx_id, id_tag="8B3D028A")
        logging.info(f"[{cp_id}] Finished session.")

async def simulate_cp201(cp_id):
    url = f"ws://localhost:9000/ocpp/{cp_id}"
    async with websockets.connect(url, subprotocols=['ocpp2.0.1']) as ws:
        cp = ChargePoint201(cp_id, ws)
        # We need to run cp.start() in a separate task
        start_task = asyncio.create_task(cp.start())
        await cp.send_boot_notification()
        logging.info(f"[{cp_id}] Simulating v2.0.1 charge session...")
        await cp.start_transaction(evse_id=1, id_token="8B3D028A")
        await asyncio.sleep(2)
        await cp.stop_transaction()
        logging.info(f"[{cp_id}] Finished v2.0.1 session.")
        start_task.cancel()

async def main():
    await asyncio.gather(
        simulate_cp16("SIM_16_01"),
        simulate_cp201("SIM_201_01")
    )

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
