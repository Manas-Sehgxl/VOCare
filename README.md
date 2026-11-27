# Bol OPD

A voice-first outpatient registration kiosk for a district hospital. Patients can answer four questions in Hindi or English, hear the record, correct a detail and receive a numbered slip. A staff view on the same browser can finish assistance requests and confirm the department.

## Run

From this directory with Docker and its Compose plugin installed:

```sh
docker compose up --build
```

Open **http://localhost:3000**. The first build needs internet access to download the NGINX image. The app has no API keys, environment variables, .env file, package install or model download. To stop, run `docker compose down`.

For local development with Python 3, run `python3 -m http.server 3000 --directory dist` and open the same address.

## Try it

1. Choose **Try the sample** and **Begin registration**. **Use sample answer** supplies fictional utterances for name, age, village and complaint.
2. In Review, choose **Change village** and **Use sample answer**. Rampur changes to Ramnagar. Confirm to issue one token, then print or finish.
3. Open **Staff desk** to review the record. Confirm the details and choose the department. Open a second tab on the same origin to see new requests while a patient registers.
4. To test failure handling, start another sample and select **Try background noise** twice, then **Ask staff for help**. The desk receives the available details. No token is issued until registration is complete.

## Live voice

Use **Start registration** on localhost or HTTPS with microphone permission and a browser supporting SpeechRecognition or webkitSpeechRecognition. Choose Hindi or English and approve voice capture. The browser reads prompts using speechSynthesis if available and listens after each prompt. Speak one answer per question; at review, say “change village” or “गाँव बदलें”, give the correction, then say “yes” or “सही है”. Touch controls also work. Recognition, installed voices and network requirements vary by browser and device. The sample works with microphone permission denied or recognition unavailable.

## Prototype boundaries

Use fictional patient details. This demo persists records in localStorage on this browser, including after Finish clears the kiosk screen. Staff and patient tabs must share the same origin and browser profile. There is no staff authentication, central database or hospital integration. Clear the site's browser storage to remove demo records. The application does not save raw audio. In live mode the browser's speech provider may process audio remotely.

Department suggestions use simple rules for explicit dentist or ENT requests; other complaints go to General OPD for staff review. The original utterance remains on the record. Routing is administrative and requires a staff decision. No medical model or paid API is involved.

The pilot would measure arrival-to-token time, independent completion and errors after confirmation. The prototype has no analytics service. A hospital deployment would need supervised language testing, private audio, authenticated staff access and agreed retention policies.
