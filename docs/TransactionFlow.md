# Detailed Universal Assistant Protocol Transaction Flow

```mermaid
sequenceDiagram
    participant User
    participant LSP7_Token as LSP7/LSP8 Token Contract
    participant UP as Universal Profile (ERC725Y)
    participant URDuap
    participant ERC725Y as ERC725Y Data Store
    participant ExecAssistant1 as Executive Assistant 1
    participant ExecAssistant2 as Executive Assistant 2
    participant ExecAssistantN as Executive Assistant N
    participant ThirdParty as Third Party
    participant LSP1 as Default Universal Receiver Delegate (LSP1)

    %% Step 1: User initiates a transaction (e.g., token transfer) to the Universal Profile
    User->>LSP7_Token: Transfer tokens or send payload to UP
    LSP7_Token->>UP: Notify Transfer (typeId, data)

    %% Step 2: UP delegates handling to URDuap
    UP->>URDuap: universalReceiverDelegate(notifier, value, typeId, data)

    %% Step 3: URDuap fetches Executive Assistants
    URDuap->>ERC725Y: Read addresses for typeId (UAPTypeConfig:<typeId>)
    ERC725Y-->>URDuap: Return [ExecAssistant1, ExecAssistant2, ..., ExecAssistantN]

    %% Step 4: URDuap calls each Executive Assistant in sequence
    loop For each ExecAssistant
        URDuap->>ExecAssistant: execute(upAddress, notifier, currentValue, typeId, currentData)
        ExecAssistant-->>URDuap: (operationType, target, execValue, callData, newDataAfterExec)

        %% URDuap executes the returned operation on the UP
        URDuap->>UP: IERC725X.execute(operationType, target, execValue, callData)

        %% Assistant may interact externally (Third Parties)
        alt External interaction
            ExecAssistant->>ThirdParty: Forward or handle external call
        end

        %% URDuap updates value/data for the next Assistant in sequence
        URDuap->>URDuap: currentValue and currentData updated
    end

    %% Step 5: If no Assistants or none were applicable, default to LSP1
    alt No ExecAssistant invoked
        URDuap->>LSP1: Fallback to standard LSP1 behavior
    end
    URDuap->>UP: Return final action
    UP->>User: Transaction processed
```

---

### **Flow Explanation**

1. **User Initiates Transaction:**
   - A **User** sends a transaction to a **Universal Profile (UP)** (i.e. interacts with an LSP7/LSP8 token contract to transfer tokens).
   - The **token contract** calls the UP’s Universal Receiver function with `typeId` and `data`.

2. **UP Delegates to `URDuap`:**
   - The **UP** forwards the call to the **URDuap** (`universalReceiverDelegate(...)`).

3. **`URDuap` Fetches Executive Assistants:**
   - **URDuap** reads from the **ERC725Y** data store using a key like `UAPTypeConfig:<typeId>`.
   - This key contains an encoded list of Executive Assistant addresses.

4. **`URDuap` Invokes Each Executive Assistant:**
   - For each Executive Assistant in the list, **URDuap** calls `execute(...)` within the same transaction context.
   - The Assistant returns operation instructions (e.g., `IERC725X.execute(...)`) plus possibly updated `value` and `data`.
   - **URDuap** then executes those instructions on the UP’s behalf.
   - This may include external interactions with third-party contracts.

5. **Fallback to LSP1:**
   - If no Executive Assistants are configured or none are invoked, **URDuap** calls the default LSP1 delegate.
   - Finally, **URDuap** returns control to the UP, completing the transaction.

---

### **(Future) Screener Assistants**

While this current version only supports **Executive Assistants**, a future release will introduce **Screener Assistants**. These will act as gatekeepers (similar to the previously discussed “Filters”), determining whether a transaction should proceed to the Executive Assistants, be modified, or be blocked. The final architecture for Screener Assistants is **TBD**.