package internal

func HandleCreateAccount(req CreateAccountRequest, db Database) CreateAccountResponse {
	id, err := db.CreateAccount(req.Name, req.Balance)
	if err != nil {
		return CreateAccountResponse{Error: err.Error()}
	}
	return CreateAccountResponse{ID: id}
}

func HandleGetAccount(req GetAccountRequest, db Database) GetAccountResponse {
	account, err := db.GetAccount(req.ID)
	if err != nil {
		return GetAccountResponse{Error: err.Error()}
	}
	return GetAccountResponse{Account: account}
}

func HandleUpdateBalance(req UpdateBalanceRequest, db Database) UpdateBalanceResponse {
	err := db.UpdateBalance(req.ID, req.Amount)
	if err != nil {
		return UpdateBalanceResponse{Error: err.Error()}
	}
	return UpdateBalanceResponse{}
}
