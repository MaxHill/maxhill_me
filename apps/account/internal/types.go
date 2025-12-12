package internal

type Account struct {
	ID      int64
	Name    string
	Balance int64
}

type CreateAccountRequest struct {
	Name    string
	Balance int64
}

type CreateAccountResponse struct {
	ID    int64
	Error string
}

type GetAccountRequest struct {
	ID int64
}

type GetAccountResponse struct {
	Account *Account
	Error   string
}

type UpdateBalanceRequest struct {
	ID     int64
	Amount int64
}

type UpdateBalanceResponse struct {
	Error string
}
